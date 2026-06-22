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
  timeline <year> <round>
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


def get_timeline(year, round_num):
    """Get race timeline including laps, positions, pit stops, and stints."""
    year = int(year)
    round_num = int(round_num)
    
    session = fastf1.get_session(year, round_num, 'Race')
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
        
        driver_num_to_id[d_num] = str(r.get('Abbreviation', ''))
        drivers_info.append({
            'driverNumber': d_num,
            'broadcastName': str(r.get('Abbreviation', '')),
            'fullName': f"{r.get('FirstName', '')} {r.get('LastName', '')}",
            'nameAcronym': str(r.get('Abbreviation', '')),
            'teamName': team_name,
            'teamColour': str(team_color).replace('#', ''),
            'countryCode': str(r.get('CountryCode', '')) if pd.notna(r.get('CountryCode')) else '',
            'headshotUrl': str(r.get('HeadshotUrl', '')) if pd.notna(r.get('HeadshotUrl')) else '',
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
    stints = {}
    if not laps.empty:
        for d_num in driver_num_to_id.keys():
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
    
    # Build pit stop events
    pit_events = {}
    if not laps.empty:
        pit_laps = laps[laps['PitInTime'].notna() | laps['PitOutTime'].notna()]
        for _, lap in pit_laps.iterrows():
            d_num_raw = lap.get('DriverNumber', '')
            if pd.isna(d_num_raw) or str(d_num_raw).strip() == '':
                continue
            d_num = int(d_num_raw)
            lap_num = int(lap['LapNumber'])
            
            if lap_num not in pit_events:
                pit_events[lap_num] = []
            
            # Calculate pit duration
            pit_dur = 0
            if pd.notna(lap.get('PitInTime')) and pd.notna(lap.get('PitOutTime')):
                try:
                    pit_dur = (lap['PitOutTime'] - lap['PitInTime']).total_seconds()
                except:
                    pit_dur = 0
            
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
    
    if hasattr(session, 'race_control_messages') and session.race_control_messages is not None:
        rcm = session.race_control_messages
        if not rcm.empty:
            for _, msg in rcm.iterrows():
                category = str(msg.get('Category', ''))
                flag = str(msg.get('Flag', '')) if pd.notna(msg.get('Flag')) else ''
                message = str(msg.get('Message', ''))
                lap_num = int(msg.get('Lap', 0)) if pd.notna(msg.get('Lap')) else 0
                
                event_type = None
                msg_upper = message.upper()
                flag_upper = flag.upper()
                if 'CHEQUERED' in msg_upper or 'CHEQUERED' in flag_upper:
                    event_type = 'chequered'
                elif 'RED' in flag_upper or ('RED FLAG' in msg_upper and 'INFRINGEMENT' not in msg_upper and 'VIOLATION' not in msg_upper and 'PENALTY' not in msg_upper and 'INVESTIGAT' not in msg_upper):
                    event_type = 'redFlag'
                elif 'YELLOW' in flag_upper:
                    event_type = 'yellowFlag'
                elif 'SAFETY CAR' in msg_upper and 'VIRTUAL' not in msg_upper:
                    event_type = 'safetyCar'
                elif 'VSC' in msg_upper or 'VIRTUAL SAFETY' in msg_upper:
                    event_type = 'vsc'
                elif 'GREEN' in flag_upper or 'TRACK CLEAR' in msg_upper or 'GREEN FLAG' in msg_upper or 'GREEN LIGHT' in msg_upper:
                    event_type = 'green'
                
                if event_type:
                    t = (lap_num - 1) * LAP_DURATION_MS if lap_num > 0 else 0
                    rc_evt = {
                        'type': event_type,
                        'msg': message[:100],
                        'lap': lap_num,
                    }
                    rc_stream.append({
                        't': t,
                        **rc_evt
                    })
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
            
            pit_dur = 0
            if pd.notna(lap.get('PitInTime')) and pd.notna(lap.get('PitOutTime')):
                try:
                    pit_dur = (lap['PitOutTime'] - lap['PitInTime']).total_seconds()
                except:
                    pit_dur = 0
            
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


def get_telemetry(year, round_num, driver_number):
    """Get car telemetry for a specific driver in a race session."""
    year = int(year)
    round_num = int(round_num)
    driver_number = str(driver_number)
    
    session = fastf1.get_session(year, round_num, 'Race')
    session.load(telemetry=True, weather=False, messages=False)
    
    driver_laps = session.laps.pick_drivers(driver_number)
    
    if driver_laps.empty:
        return {'laps': [], 'telemetry': []}
    
    # Get fastest lap telemetry as sample
    fastest = driver_laps.pick_fastest()
    if fastest is None or (hasattr(fastest, 'empty') and fastest.empty):
        # Pick first lap instead
        fastest = driver_laps.iloc[0]
    
    tel = fastest.get_telemetry()
    
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
        'laps': laps_summary,
        'telemetry': telemetry_data,
    }


def get_incidents(year, round_num):
    """Get race control messages / incidents for a race session."""
    year = int(year)
    round_num = int(round_num)
    
    session = fastf1.get_session(year, round_num, 'Race')
    session.load(telemetry=False, weather=False, messages=True)
    
    incidents = []
    
    if hasattr(session, 'race_control_messages') and session.race_control_messages is not None:
        rcm = session.race_control_messages
        if not rcm.empty:
            for _, msg in rcm.iterrows():
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
    
    # Event info
    event_info = session.event
    return {
        'season': year,
        'round': round_num,
        'raceName': str(event_info.get('EventName', '')),
        'incidents': incidents,
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
            result = get_timeline(year, round_num)
        elif action == 'telemetry':
            year = sys.argv[2]
            round_num = sys.argv[3]
            driver_number = sys.argv[4]
            result = get_telemetry(year, round_num, driver_number)
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
