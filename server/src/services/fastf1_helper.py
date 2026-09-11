"""
FastF1 Helper Script
--------------------
This script interfaces with the FastF1 Python library and outputs JSON to stdout.
It is called by the Node.js server via child_process.spawn.

Usage:
  python fastf1_helper.py <action> [args...]

Actions:
  schedule <year>
  results <year> <round>
  timeline <year> <round> [session_id]
  timeline_extras <year> <round> [session_id]
  telemetry <year> <round> <driver_number>
  incidents <year> <round>
"""

import sys
import json
import os
import warnings
import traceback

# Suppress warnings from fastf1 / pandas
warnings.filterwarnings('ignore')

import fastf1
import pandas as pd
import numpy as np

# Enable caching in a directory relative to this script
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'fastf1_cache')
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (pd.Timestamp, pd.Timedelta)):
        return str(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    if pd.isna(obj):
        return None
    raise TypeError(f"Type {type(obj)} not serializable")


def get_schedule(year):
    """Get the event schedule for a given year."""
    year = int(year)
    schedule = fastf1.get_event_schedule(year)
    
    races = []
    for _, event in schedule.iterrows():
        # Skip testing events
        if event.get('EventFormat', '') == 'testing':
            continue
        
        race = {
            'round': int(event.get('RoundNumber', 0)),
            'raceName': str(event.get('EventName', '')),
            'officialEventName': str(event.get('OfficialEventName', '')),
            'country': str(event.get('Country', '')),
            'location': str(event.get('Location', '')),
            'eventFormat': str(event.get('EventFormat', '')),
        }
        
        # Session dates
        for i in range(1, 6):
            session_key = f'Session{i}'
            date_key = f'Session{i}Date'
            if session_key in event and date_key in event:
                session_name = str(event[session_key]) if pd.notna(event[session_key]) else None
                session_date = str(event[date_key]) if pd.notna(event[date_key]) else None
                if session_name and session_name != 'None':
                    race[f'session{i}'] = session_name
                    race[f'session{i}Date'] = session_date
        
        if race['round'] > 0:
            races.append(race)
    
    return {'season': year, 'races': races}


def get_results(year, round_num):
    """Get race results for a specific year and round."""
    year = int(year)
    round_num = int(round_num)
    
    session = fastf1.get_session(year, round_num, 'Race')
    session.load(telemetry=False, weather=False, messages=False)
    
    results_list = []
    for _, r in session.results.iterrows():
        driver_num = r.get('DriverNumber', '')
        
        result = {
            'position': int(r['Position']) if pd.notna(r.get('Position')) else None,
            'positionText': str(int(r['Position'])) if pd.notna(r.get('Position')) else 'R',
            'points': float(r['Points']) if pd.notna(r.get('Points')) else 0,
            'driver': {
                'id': str(r.get('DriverId', '')),
                'number': int(driver_num) if pd.notna(driver_num) and str(driver_num).isdigit() else 0,
                'code': str(r.get('Abbreviation', '')),
                'firstName': str(r.get('FirstName', '')),
                'lastName': str(r.get('LastName', '')),
            },
            'constructor': {
                'id': str(r.get('TeamId', '')),
                'name': str(r.get('TeamName', '')),
            },
            'grid': int(r['GridPosition']) if pd.notna(r.get('GridPosition')) else 0,
            'laps': int(r.get('NumberOfLaps', 0)) if pd.notna(r.get('NumberOfLaps')) else 0,
            'status': str(r.get('Status', '')),
            'time': str(r['Time']) if pd.notna(r.get('Time')) else None,
            'fastestLap': None,
        }
        
        # Check for fastest lap time
        if pd.notna(r.get('FastestLapTime')):
            result['fastestLap'] = {
                'time': str(r['FastestLapTime']),
            }
        
        results_list.append(result)
    
    # Sort by position (None positions at the end)
    results_list.sort(key=lambda x: (x['position'] is None, x['position'] or 999))
    
    event_info = session.event
    return {
        'season': year,
        'round': round_num,
        'raceName': str(event_info.get('EventName', '')),
        'circuit': {
            'name': str(event_info.get('Location', '')),
            'country': str(event_info.get('Country', '')),
        },
        'date': str(event_info.get('Session5Date', '')),
        'results': results_list,
    }


def _compute_stints(laps):
    """Compute tire stints per driver from a session's laps dataframe.

    Returns {driverNumber(str): [{stintNumber, compound, lapStart, lapEnd}, ...]}
    """
    stints = {}
    if laps.empty:
        return stints

    driver_numbers = set()
    for raw in laps['DriverNumber'].unique():
        if pd.isna(raw) or str(raw).strip() == '':
            continue
        driver_numbers.add(int(raw))

    for d_num in driver_numbers:
        driver_laps = laps[laps['DriverNumber'] == str(d_num)]
        if driver_laps.empty:
            continue

        driver_stints = []
        current_compound = None
        stint_start = None
        stint_number = 0

        for _, lap in driver_laps.sort_values('LapNumber').iterrows():
            compound = str(lap.get('Compound', '')) if pd.notna(lap.get('Compound')) else 'UNKNOWN'
            lap_number = int(lap['LapNumber'])

            if compound != current_compound:
                if current_compound is not None:
                    driver_stints.append({
                        'stintNumber': stint_number,
                        'compound': current_compound,
                        'lapStart': stint_start,
                        'lapEnd': lap_number - 1,
                    })
                stint_number += 1
                current_compound = compound
                stint_start = lap_number

        # Close last stint
        if current_compound is not None and stint_start is not None:
            max_driver_lap = int(driver_laps['LapNumber'].max())
            driver_stints.append({
                'stintNumber': stint_number,
                'compound': current_compound,
                'lapStart': stint_start,
                'lapEnd': max_driver_lap,
            })

        stints[str(d_num)] = driver_stints

    return stints


def _pit_lane_seconds(laps, driver_num, in_lap_num, pit_in_time):
    """Pit-lane time = out-lap PitOutTime - in-lap PitInTime.

    FastF1 stores PitInTime on the in-lap and PitOutTime on the following
    out-lap, so the two must be paired across lap rows. Returns 0 if the
    out-lap or either timestamp is missing.
    """
    if pd.isna(pit_in_time):
        return 0
    out_lap = laps[(laps['DriverNumber'] == str(driver_num)) & (laps['LapNumber'] == in_lap_num + 1)]
    if out_lap.empty:
        return 0
    pit_out_time = out_lap.iloc[0].get('PitOutTime')
    if pd.isna(pit_out_time):
        return 0
    try:
        return (pit_out_time - pit_in_time).total_seconds()
    except Exception:
        return 0


def _classify_rc_message(message, flag, category=''):
    """Classify a single race control message into a flag event type, or None.

    Safety car / VSC are keyed off the FastF1 message Category ('SafetyCar'),
    not the message text. Otherwise stewards' "SAFETY CAR INFRINGEMENT" penalty
    notes (Category 'Other') get mistaken for an actual safety car deployment.
    """
    msg_upper = message.upper()
    flag_upper = flag.upper()
    if 'CHEQUERED' in msg_upper or 'CHEQUERED' in flag_upper:
        return 'chequered'
    elif 'RED' in flag_upper or ('RED FLAG' in msg_upper and 'INFRINGEMENT' not in msg_upper and 'VIOLATION' not in msg_upper and 'PENALTY' not in msg_upper and 'INVESTIGAT' not in msg_upper):
        return 'redFlag'
    elif 'YELLOW' in flag_upper:
        return 'yellowFlag'
    elif category == 'SafetyCar':
        # Genuine SC/VSC status change (deployed / in this lap). Stewards'
        # "SAFETY CAR INFRINGEMENT" notes are Category 'Other' and skipped.
        if 'VIRTUAL' in msg_upper or 'VSC' in msg_upper:
            return 'vsc'
        return 'safetyCar'
    elif 'GREEN' in flag_upper or 'TRACK CLEAR' in msg_upper or 'GREEN FLAG' in msg_upper or 'GREEN LIGHT' in msg_upper:
        return 'green'
    return None


def _compute_race_control(session):
    """Classify a session's race control messages into flag events.

    Returns a flat list of {type, msg, lap} in chronological order.
    """
    events = []
    if hasattr(session, 'race_control_messages') and session.race_control_messages is not None:
        rcm = session.race_control_messages
        if not rcm.empty:
            for _, msg in rcm.iterrows():
                flag = str(msg.get('Flag', '')) if pd.notna(msg.get('Flag')) else ''
                message = str(msg.get('Message', ''))
                category = str(msg.get('Category', '')) if pd.notna(msg.get('Category')) else ''
                lap_num = int(msg.get('Lap', 0)) if pd.notna(msg.get('Lap')) else 0
                # Skip pre-race (lap 0) flags — formation-lap sector yellows and
                # pit-exit greens that would otherwise leave the replay showing a
                # flag at the start. The race begins green (synthetic start event).
                if lap_num < 1:
                    continue
                event_type = _classify_rc_message(message, flag, category)
                if event_type:
                    # Skip the burst of "YELLOW IN TRACK SECTOR" flags waved on the
                    # opening lap: these are standard race-start sector yellows
                    # present in every race, not a mid-race incident, and would
                    # otherwise paint a permanent yellow band at lap 1. A genuine
                    # opening-lap hazard shows up as SC/VSC/red, which are kept.
                    if event_type == 'yellowFlag' and lap_num == 1:
                        continue
                    events.append({
                        'type': event_type,
                        'msg': message[:100],
                        'lap': lap_num,
                    })
                    # Ignore everything after the chequered flag — post-race sector
                    # yellows / clears (cars slowing, celebrations) aren't relevant.
                    if event_type == 'chequered':
                        break
    return events


def get_timeline_extras(year, round_num, session_id='R'):
    """Get the FastF1-only data used to enrich a Jolpica-built timeline.

    Loads the session once and returns tire stints plus classified race
    control flag events. Lightweight (no telemetry / no position parsing).
    """
    year = int(year)
    round_num = int(round_num)

    session = fastf1.get_session(year, round_num, session_id)
    session.load(telemetry=False, weather=False, messages=True)

    return {
        'stints': _compute_stints(session.laps),
        'raceControl': _compute_race_control(session),
    }


def get_timeline(year, round_num, session_id='R'):
    """Get session timeline including laps, positions, pit stops, and stints.

    session_id: FastF1 session identifier ('R' for Race, 'S' for Sprint).
    """
    year = int(year)
    round_num = int(round_num)

    session = fastf1.get_session(year, round_num, session_id)
    session.load(telemetry=False, weather=False, messages=True)
    
    results = session.results
    laps = session.laps
    
    # Team color map
    team_color_map = {
        'Red Bull Racing': '3671C6',
        'Mercedes': '27F4D2',
        'Ferrari': 'E8002D',
        'McLaren': 'FF8000',
        'Aston Martin': '229971',
        'Alpine': 'FF87BC',
        'Williams': '64C4FF',
        'Haas F1 Team': 'B6BABD',
        'RB': '6692FF',
        'Kick Sauber': '52E252',
    }
    
    # Build driver info
    drivers_info = []
    driver_num_to_id = {}
    for _, r in results.iterrows():
        d_num_raw = r.get('DriverNumber', '')
        if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
            continue
        d_num = int(d_num_raw)
        team_name = str(r.get('TeamName', ''))
        team_color = team_color_map.get(team_name, r.get('TeamColor', '888888'))
        if pd.isna(team_color) or team_color == 'nan':
            team_color = '888888'
        
        # DNF detection: judge by Status, not ClassifiedPosition. A retired car
        # can still be *classified* with a numeric position (≥90% distance), so
        # ClassifiedPosition alone misses those. A car reached the flag only if
        # its status is 'Finished' or a lapped classification ('+N Lap(s)').
        classified = str(r.get('ClassifiedPosition', '')).strip() if pd.notna(r.get('ClassifiedPosition')) else ''
        status = str(r.get('Status', '')).strip() if pd.notna(r.get('Status')) else ''
        reached_flag = status.strip().lower() == 'finished' or 'lap' in status.lower()

        driver_num_to_id[d_num] = str(r.get('Abbreviation', ''))
        drivers_info.append({
            'driverNumber': d_num,
            'driverId': str(r.get('DriverId', '')),
            'broadcastName': str(r.get('Abbreviation', '')),
            'fullName': f"{r.get('FirstName', '')} {r.get('LastName', '')}",
            'nameAcronym': str(r.get('Abbreviation', '')),
            'teamName': team_name,
            'teamColour': str(team_color).replace('#', ''),
            'countryCode': str(r.get('CountryCode', '')) if pd.notna(r.get('CountryCode')) else '',
            'headshotUrl': str(r.get('HeadshotUrl', '')) if pd.notna(r.get('HeadshotUrl')) else '',
            'status': status,
            'dnf': not reached_flag,
            'finishPosition': int(r['Position']) if pd.notna(r.get('Position')) else 99,
        })
    
    # Build timeline data (lap-by-lap positions)
    timeline = []
    total_laps = 0
    
    if not laps.empty:
        max_lap = int(laps['LapNumber'].max())
        total_laps = max_lap
        
        # Lap 0 = starting grid
        lap0 = {'lap': 0}
        for _, r in results.iterrows():
            d_num_raw = r.get('DriverNumber', '')
            if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
                continue
            d_num = int(d_num_raw)
            grid = int(r['GridPosition']) if pd.notna(r.get('GridPosition')) else 0
            lap0[f'd{d_num}'] = grid
        timeline.append(lap0)
        
        # Laps 1 to N
        for lap_num in range(1, max_lap + 1):
            lap_data = {'lap': lap_num}
            lap_laps = laps[laps['LapNumber'] == lap_num]
            for _, lap in lap_laps.iterrows():
                d_num_raw = lap.get('DriverNumber', '')
                if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
                    continue
                d_num = int(d_num_raw)
                pos = lap.get('Position')
                if pd.notna(pos):
                    lap_data[f'd{d_num}'] = int(pos)
            timeline.append(lap_data)
    
    # Build stints data
    stints = _compute_stints(laps)

    # Build pit stop events. FastF1 splits one stop across two lap rows:
    # PitInTime on the in-lap (driver boxes) and PitOutTime on the next lap
    # (driver rejoins). Attribute the event to the in-lap only so a single stop
    # isn't counted twice, and pair the two timestamps for the real pit-lane time.
    pit_events = {}
    if not laps.empty:
        pit_in_laps = laps[laps['PitInTime'].notna()]
        for _, lap in pit_in_laps.iterrows():
            d_num_raw = lap.get('DriverNumber', '')
            if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
                continue
            d_num = int(d_num_raw)
            lap_num = int(lap['LapNumber'])

            if lap_num not in pit_events:
                pit_events[lap_num] = []

            pit_dur = _pit_lane_seconds(laps, d_num, lap_num, lap.get('PitInTime'))

            pit_events[lap_num].append({
                'type': 'pit',
                'driverNumber': d_num,
                'duration': round(pit_dur, 1) if pit_dur > 0 else 0,
                'driver': driver_num_to_id.get(d_num, f'#{d_num}'),
            })
    
    # Build race control stream & events by lap
    rc_events_by_lap = {}
    rc_stream = [{'t': 0, 'type': 'green', 'msg': 'Race Started', 'lap': 1}]
    LAP_DURATION_MS = 90000

    for rc_evt in _compute_race_control(session):
        lap_num = rc_evt['lap']
        t = (lap_num - 1) * LAP_DURATION_MS if lap_num > 0 else 0
        rc_stream.append({'t': t, **rc_evt})
        if lap_num > 0:
            if lap_num not in rc_events_by_lap:
                rc_events_by_lap[lap_num] = []
            rc_events_by_lap[lap_num].append(rc_evt)

    # End flag
    end_evt = {
        'type': 'chequered',
        'msg': 'Chequered Flag',
        'lap': total_laps
    }
    rc_stream.append({
        't': total_laps * LAP_DURATION_MS,
        **end_evt
    })
    if total_laps > 0:
        if total_laps not in rc_events_by_lap:
            rc_events_by_lap[total_laps] = []
        rc_events_by_lap[total_laps].append(end_evt)
    
    # Add events to timeline
    for lap_data in timeline:
        lap_num = lap_data['lap']
        lap_events = []
        if lap_num in pit_events:
            lap_events.extend(pit_events[lap_num])
        if lap_num in rc_events_by_lap:
            lap_events.extend(rc_events_by_lap[lap_num])
        
        if lap_events:
            lap_data['_events'] = lap_events
    
    # Build streams for RaceReplay
    lap_stream = [{'lap': i, 't': (i - 1) * LAP_DURATION_MS} for i in range(1, total_laps + 1)]
    
    position_stream = []
    # Lap 0 grid
    for _, r in results.iterrows():
        d_num_raw = r.get('DriverNumber', '')
        if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
            continue
        d_num = int(d_num_raw)
        grid = int(r['GridPosition']) if pd.notna(r.get('GridPosition')) else 0
        position_stream.append({'t': -10000, 'dn': d_num, 'pos': grid})
    
    # Laps 1 to N
    if not laps.empty:
        for _, lap in laps.iterrows():
            d_num_raw = lap.get('DriverNumber', '')
            if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
                continue
            d_num = int(d_num_raw)
            pos = lap.get('Position')
            lap_num = int(lap['LapNumber'])
            if pd.notna(pos):
                t = (lap_num - 1) * LAP_DURATION_MS
                position_stream.append({'t': t, 'dn': d_num, 'pos': int(pos)})
    
    position_stream.sort(key=lambda x: x['t'])
    
    # Build pit stream
    pit_stream = []
    if not laps.empty:
        pit_in_laps = laps[laps['PitInTime'].notna()]
        for _, lap in pit_in_laps.iterrows():
            d_num_raw = lap.get('DriverNumber', '')
            if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
                continue
            d_num = int(d_num_raw)
            lap_num = int(lap['LapNumber'])
            
            pit_dur = _pit_lane_seconds(laps, d_num, lap_num, lap.get('PitInTime'))

            pit_stream.append({
                't': (lap_num - 1) * LAP_DURATION_MS + 45000,
                'dn': d_num,
                'dur': round(pit_dur, 1),
                'lap': lap_num,
            })
            
    return {
        'drivers': drivers_info,
        'totalLaps': total_laps,
        'timeline': timeline,
        'stints': stints,
        'positionStream': position_stream,
        'pitStream': pit_stream,
        'rcStream': rc_stream,
        'lapStream': lap_stream,
        'raceStartTime': 0,
        'raceEndTime': total_laps * LAP_DURATION_MS,
    }


def get_telemetry(year, round_num, driver_number, lap_number=None):
    """Get car telemetry for a specific driver in a race session."""
    year = int(year)
    round_num = int(round_num)
    driver_number = str(driver_number)
    
    session = fastf1.get_session(year, round_num, 'Race')
    session.load(telemetry=True, weather=False, messages=False)
    
    driver_laps = session.laps.pick_drivers(driver_number)
    
    if driver_laps.empty:
        return {'laps': [], 'telemetry': [], 'telemetryLap': None}

    # Choose which lap's telemetry to return: an explicitly requested lap, else
    # the driver's fastest lap (default).
    target = None
    if lap_number is not None:
        try:
            sel = driver_laps[driver_laps['LapNumber'] == int(lap_number)]
            if not sel.empty:
                target = sel.iloc[0]
        except (ValueError, TypeError):
            target = None
    if target is None:
        target = driver_laps.pick_fastest()
        if target is None or (hasattr(target, 'empty') and target.empty):
            target = driver_laps.iloc[0]

    telemetry_lap = int(target['LapNumber']) if pd.notna(target.get('LapNumber')) else None
    tel = target.get_telemetry()
    
    telemetry_data = []
    if tel is not None and not tel.empty:
        # Downsample to every 10th point for reasonable payload size
        step = max(1, len(tel) // 500)
        sampled = tel.iloc[::step]
        
        for _, t in sampled.iterrows():
            point = {
                'distance': float(t.get('Distance', 0)) if pd.notna(t.get('Distance')) else 0,
                'speed': float(t.get('Speed', 0)) if pd.notna(t.get('Speed')) else 0,
                'throttle': float(t.get('Throttle', 0)) if pd.notna(t.get('Throttle')) else 0,
                'brake': bool(t.get('Brake', False)) if pd.notna(t.get('Brake')) else False,
                'gear': int(t.get('nGear', 0)) if pd.notna(t.get('nGear')) else 0,
                'rpm': float(t.get('RPM', 0)) if pd.notna(t.get('RPM')) else 0,
                'drs': int(t.get('DRS', 0)) if pd.notna(t.get('DRS')) else 0,
            }
            telemetry_data.append(point)
    
    # Lap-by-lap summary
    laps_summary = []
    for _, lap in driver_laps.iterrows():
        lap_time = lap.get('LapTime')
        lt_seconds = None
        if pd.notna(lap_time):
            try:
                lt_seconds = lap_time.total_seconds()
            except:
                lt_seconds = None
        
        laps_summary.append({
            'lapNumber': int(lap['LapNumber']),
            'lapTime': lt_seconds,
            'sector1': lap.get('Sector1Time').total_seconds() if pd.notna(lap.get('Sector1Time')) else None,
            'sector2': lap.get('Sector2Time').total_seconds() if pd.notna(lap.get('Sector2Time')) else None,
            'sector3': lap.get('Sector3Time').total_seconds() if pd.notna(lap.get('Sector3Time')) else None,
            'compound': str(lap.get('Compound', '')) if pd.notna(lap.get('Compound')) else None,
            'tyreLife': int(lap.get('TyreLife', 0)) if pd.notna(lap.get('TyreLife')) else None,
            'stint': int(lap.get('Stint', 0)) if pd.notna(lap.get('Stint')) else None,
            'isPersonalBest': bool(lap.get('IsPersonalBest', False)) if pd.notna(lap.get('IsPersonalBest')) else False,
            # Raw FastF1 track status for the lap: a string of status codes that
            # occurred during the lap. 1=green, 2=yellow, 4=SC, 5=red, 6/7=VSC.
            'trackStatus': str(lap.get('TrackStatus')) if pd.notna(lap.get('TrackStatus')) else None,
            # Pit involvement: pitIn = driver entered the pit lane on this lap
            # (in-lap); pitOut = driver exited the pit lane on this lap (out-lap).
            'pitIn': bool(pd.notna(lap.get('PitInTime'))),
            'pitOut': bool(pd.notna(lap.get('PitOutTime'))),
            # Speed-trap readings (km/h): I1/I2 = intermediate points, FL =
            # finish line, ST = speed trap on the longest straight. Useful as an
            # indirect view of straight-line pace (e.g. 2026 override boost).
            'speedI1': float(lap.get('SpeedI1')) if pd.notna(lap.get('SpeedI1')) else None,
            'speedI2': float(lap.get('SpeedI2')) if pd.notna(lap.get('SpeedI2')) else None,
            'speedFL': float(lap.get('SpeedFL')) if pd.notna(lap.get('SpeedFL')) else None,
            'speedST': float(lap.get('SpeedST')) if pd.notna(lap.get('SpeedST')) else None,
        })
    
    # Driver info
    driver_info = None
    driver_result = session.results[session.results['DriverNumber'] == driver_number]
    if not driver_result.empty:
        dr = driver_result.iloc[0]
        driver_info = {
            'number': int(driver_number),
            'code': str(dr.get('Abbreviation', '')),
            'firstName': str(dr.get('FirstName', '')),
            'lastName': str(dr.get('LastName', '')),
            'team': str(dr.get('TeamName', '')),
            'teamColor': str(dr.get('TeamColor', '888888')).replace('#', ''),
        }
    
    return {
        'driver': driver_info,
        'telemetryLap': telemetry_lap,
        'laps': laps_summary,
        'telemetry': telemetry_data,
    }


def _race_start_time(session):
    """Best-effort absolute race start (lights-out) using ONLY race control
    messages, so no (slow) telemetry load is needed.

    FastF1 tags every message before the race gets going as lap 1, so the grid /
    formation-lap sector yellows, pit-exit greens and pre-race notices are
    indistinguishable from real opening-lap incidents by lap number alone. The
    pit lane exit opens at lights-out, so the last "PIT EXIT OPEN" message on the
    opening lap reliably marks the start (verified to match FastF1's own
    t0_date + session_start_time, incl. delayed starts). Falls back to the
    scheduled session start time when that message is absent.
    """
    try:
        rcm = getattr(session, 'race_control_messages', None)
        if rcm is not None and not rcm.empty:
            opens = rcm[rcm['Message'].astype(str).str.contains('PIT EXIT OPEN', case=False, na=False)]
            if 'Lap' in opens.columns:
                opens = opens[opens['Lap'].fillna(1) <= 1]
            if not opens.empty:
                return opens['Time'].max()
    except Exception:
        pass
    try:
        return pd.Timestamp(session.date)
    except Exception:
        return None


def get_incidents(year, round_num):
    """Get race control messages / incidents for a race session."""
    year = int(year)
    round_num = int(round_num)

    session = fastf1.get_session(year, round_num, 'Race')
    session.load(telemetry=False, weather=False, messages=True)

    incidents = []
    # Everything strictly before lights-out is grid/formation-lap noise, not a
    # race incident, so it's dropped (see _race_start_time).
    race_start = _race_start_time(session)

    if hasattr(session, 'race_control_messages') and session.race_control_messages is not None:
        rcm = session.race_control_messages
        if not rcm.empty:
            for _, msg in rcm.iterrows():
                msg_time = msg.get('Time')
                if race_start is not None and pd.notna(msg_time) and msg_time < race_start:
                    continue
                incident = {
                    'time': str(msg.get('Time', '')) if pd.notna(msg.get('Time')) else '',
                    'category': str(msg.get('Category', '')) if pd.notna(msg.get('Category')) else '',
                    'flag': str(msg.get('Flag', '')) if pd.notna(msg.get('Flag')) else '',
                    'scope': str(msg.get('Scope', '')) if pd.notna(msg.get('Scope')) else '',
                    'sector': int(msg.get('Sector', 0)) if pd.notna(msg.get('Sector')) else None,
                    'message': str(msg.get('Message', '')) if pd.notna(msg.get('Message')) else '',
                    'lap': int(msg.get('Lap', 0)) if pd.notna(msg.get('Lap')) else None,
                    'driverNumber': str(msg.get('RacingNumber', '')) if pd.notna(msg.get('RacingNumber')) else None,
                }
                incidents.append(incident)

    # Map racing number -> driver code/name so the UI can name driver-specific
    # messages instead of showing a bare "#44".
    drivers = {}
    try:
        results = getattr(session, 'results', None)
        if results is not None and not results.empty:
            for _, row in results.iterrows():
                num = str(row.get('DriverNumber', '')) if pd.notna(row.get('DriverNumber')) else ''
                if num:
                    drivers[num] = {
                        'code': str(row.get('Abbreviation', '')) if pd.notna(row.get('Abbreviation')) else '',
                        'name': str(row.get('FullName', '')) if pd.notna(row.get('FullName')) else '',
                        'team': str(row.get('TeamName', '')) if pd.notna(row.get('TeamName')) else '',
                    }
    except Exception:
        pass

    # Event info
    event_info = session.event
    return {
        'season': year,
        'round': round_num,
        'raceName': str(event_info.get('EventName', '')),
        'incidents': incidents,
        'drivers': drivers,
    }


def get_sessions(year, round_num):
    """Get available sessions for a given round."""
    year = int(year)
    round_num = int(round_num)
    
    event = fastf1.get_event(year, round_num)
    
    sessions = []
    for i in range(1, 6):
        session_key = f'Session{i}'
        date_key = f'Session{i}Date'
        if session_key in event and pd.notna(event[session_key]):
            session_name = str(event[session_key])
            session_date = str(event[date_key]) if date_key in event and pd.notna(event[date_key]) else None
            if session_name and session_name != 'None':
                sessions.append({
                    'key': i,
                    'name': session_name,
                    'date': session_date,
                })
    
    return {
        'year': year,
        'round': round_num,
        'eventName': str(event.get('EventName', '')),
        'sessions': sessions,
    }


def get_drivers(year, round_num):
    """Get drivers for a given race session."""
    year = int(year)
    round_num = int(round_num)
    
    session = fastf1.get_session(year, round_num, 'Race')
    session.load(telemetry=False, weather=False, messages=False)
    
    drivers = []
    for _, r in session.results.iterrows():
        d_num_raw = r.get('DriverNumber', '')
        if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
            continue
        
        team_color = str(r.get('TeamColor', '888888'))
        if pd.isna(team_color) or team_color == 'nan':
            team_color = '888888'
        
        drivers.append({
            'number': int(d_num_raw),
            'code': str(r.get('Abbreviation', '')),
            'firstName': str(r.get('FirstName', '')),
            'lastName': str(r.get('LastName', '')),
            'team': str(r.get('TeamName', '')),
            'teamColor': team_color.replace('#', ''),
            'position': int(r['Position']) if pd.notna(r.get('Position')) else None,
        })
    
    drivers.sort(key=lambda x: (x['position'] is None, x['position'] or 999))
    return {'drivers': drivers}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No action specified'}), file=sys.stdout)
        sys.exit(1)
    
    action = sys.argv[1]
    
    try:
        if action == 'schedule':
            year = sys.argv[2] if len(sys.argv) > 2 else '2024'
            result = get_schedule(year)
        elif action == 'results':
            year = sys.argv[2]
            round_num = sys.argv[3]
            result = get_results(year, round_num)
        elif action == 'timeline':
            year = sys.argv[2]
            round_num = sys.argv[3]
            session_id = sys.argv[4] if len(sys.argv) > 4 else 'R'
            result = get_timeline(year, round_num, session_id)
        elif action == 'timeline_extras':
            year = sys.argv[2]
            round_num = sys.argv[3]
            session_id = sys.argv[4] if len(sys.argv) > 4 else 'R'
            result = get_timeline_extras(year, round_num, session_id)
        elif action == 'telemetry':
            year = sys.argv[2]
            round_num = sys.argv[3]
            driver_number = sys.argv[4]
            lap_number = sys.argv[5] if len(sys.argv) > 5 else None
            result = get_telemetry(year, round_num, driver_number, lap_number)
        elif action == 'incidents':
            year = sys.argv[2]
            round_num = sys.argv[3]
            result = get_incidents(year, round_num)
        elif action == 'sessions':
            year = sys.argv[2]
            round_num = sys.argv[3]
            result = get_sessions(year, round_num)
        elif action == 'drivers':
            year = sys.argv[2]
            round_num = sys.argv[3]
            result = get_drivers(year, round_num)
        else:
            result = {'error': f'Unknown action: {action}'}
        
        print(json.dumps(result, default=json_serial, ensure_ascii=False))
    except Exception as e:
        error_msg = {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error_msg, ensure_ascii=False), file=sys.stdout)
        sys.exit(1)


if __name__ == '__main__':
    main()
