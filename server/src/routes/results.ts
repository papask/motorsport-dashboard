import { Router } from 'express';
import { getRaceResults, getLastRaceResults, getQualifyingResults, getSprintResults } from '../services/jolpicaService';
import { getTimeline, getTimelineExtras } from '../services/fastf1Service';
import { getCompiledRaceTimeline, mergeRaceControlEvents } from '../services/timelineCompiler';
import { sendRouteError } from '../utils/errorResponse';

const router = Router();

// GET /api/results/last
router.get('/last', async (_req, res) => {
  try {
    const data = await getLastRaceResults();
    res.json(data);
  } catch (error: any) {
    console.error('Last race results error:', error.message);
    sendRouteError(res, error, '최근 레이스 결과를 가져올 수 없습니다.');
  }
});

// GET /api/results/timeline/:year/:round
// Positions/pit stops/drivers come from Jolpica (fast, reliable); tire stints and
// race-control flags are only available from FastF1, so they're fetched separately
// and merged in. If FastF1 is unavailable, the timeline still renders without them.
router.get('/timeline/:year/:round', async (req, res) => {
  try {
    const data: any = await getCompiledRaceTimeline(req.params.year, req.params.round);
    if (!data) {
      return res.status(404).json({ error: '해당 레이스 타임라인을 찾을 수 없습니다.' });
    }

    try {
      const extras: any = await getTimelineExtras(req.params.year, req.params.round, 'R');
      data.stints = extras?.stints || {};
      mergeRaceControlEvents(data, extras?.raceControl || []);
    } catch (err: any) {
      console.warn('FastF1 timeline extras (stints/race control) unavailable:', err.message);
    }

    res.json(data);
  } catch (error: any) {
    console.error('Timeline error:', error.message);
    sendRouteError(res, error, '타임라인 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/results/timeline/:year/:round/sprint
router.get('/timeline/:year/:round/sprint', async (req, res) => {
  try {
    const data = await getTimeline(req.params.year, req.params.round, 'S');
    if (!data) {
      return res.status(404).json({ error: '해당 스프린트 타임라인을 찾을 수 없습니다.' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Sprint timeline error:', error.message);
    res.status(500).json({ error: '스프린트 타임라인 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/results/:year/:round/qualifying
router.get('/:year/:round/qualifying', async (req, res) => {
  try {
    const data = await getQualifyingResults(req.params.year, req.params.round);
    if (!data) {
      return res.status(404).json({ error: '해당 퀄리파잉 결과를 찾을 수 없습니다.' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Qualifying results error:', error.message);
    sendRouteError(res, error, '퀄리파잉 결과 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/results/:year/:round/sprint
router.get('/:year/:round/sprint', async (req, res) => {
  try {
    const data = await getSprintResults(req.params.year, req.params.round);
    if (!data) {
      return res.status(404).json({ error: '해당 스프린트 결과를 찾을 수 없습니다.' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Sprint results error:', error.message);
    sendRouteError(res, error, '스프린트 결과 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/results/:year/:round
router.get('/:year/:round', async (req, res) => {
  try {
    const data = await getRaceResults(req.params.year, req.params.round);
    if (!data) {
      return res.status(404).json({ error: '해당 레이스 결과를 찾을 수 없습니다.' });
    }
    res.json(data);
  } catch (error: any) {
    console.error('Race results error:', error.message);
    sendRouteError(res, error, '레이스 결과 데이터를 가져올 수 없습니다.');
  }
});

export default router;
