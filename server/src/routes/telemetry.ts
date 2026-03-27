import { Router } from 'express';
import { getSessions, getLaps, getCarData, getPositions, getPitStops, getWeather, getRaceTimeline, getRaceIncidents } from '../services/openf1Service';

const router = Router();

// GET /api/telemetry/sessions/:year
router.get('/sessions/:year', async (req, res) => {
  try {
    const data = await getSessions(parseInt(req.params.year));
    res.json(data);
  } catch (error: any) {
    console.error('Sessions error:', error.message);
    res.status(500).json({ error: '세션 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/laps/:sessionKey?driver_number=XX
router.get('/laps/:sessionKey', async (req, res) => {
  try {
    const driverNumber = req.query.driver_number ? parseInt(req.query.driver_number as string) : undefined;
    const data = await getLaps(parseInt(req.params.sessionKey), driverNumber);
    res.json(data);
  } catch (error: any) {
    console.error('Laps error:', error.message);
    res.status(500).json({ error: '랩타임 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/car/:sessionKey/:driverNumber
router.get('/car/:sessionKey/:driverNumber', async (req, res) => {
  try {
    const data = await getCarData(parseInt(req.params.sessionKey), parseInt(req.params.driverNumber));
    res.json(data);
  } catch (error: any) {
    console.error('Car data error:', error.message);
    res.status(500).json({ error: '텔레메트리 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/positions/:sessionKey
router.get('/positions/:sessionKey', async (req, res) => {
  try {
    const data = await getPositions(parseInt(req.params.sessionKey));
    res.json(data);
  } catch (error: any) {
    console.error('Positions error:', error.message);
    res.status(500).json({ error: '포지션 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/pitstops/:sessionKey
router.get('/pitstops/:sessionKey', async (req, res) => {
  try {
    const data = await getPitStops(parseInt(req.params.sessionKey));
    res.json(data);
  } catch (error: any) {
    console.error('Pit stops error:', error.message);
    res.status(500).json({ error: '피트스톱 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/weather/:sessionKey
router.get('/weather/:sessionKey', async (req, res) => {
  try {
    const data = await getWeather(parseInt(req.params.sessionKey));
    res.json(data);
  } catch (error: any) {
    console.error('Weather error:', error.message);
    res.status(500).json({ error: '날씨 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/timeline/:sessionKey
router.get('/timeline/:sessionKey', async (req, res) => {
  try {
    const data = await getRaceTimeline(parseInt(req.params.sessionKey));
    res.json(data);
  } catch (error: any) {
    console.error('Timeline error:', error.message);
    res.status(500).json({ error: '레이스 타임라인 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/incidents/:sessionKey
router.get('/incidents/:sessionKey', async (req, res) => {
  try {
    const data = await getRaceIncidents(parseInt(req.params.sessionKey));
    res.json(data);
  } catch (error: any) {
    console.error('Incidents error:', error.message);
    res.status(500).json({ error: '인시던트 데이터를 가져올 수 없습니다.' });
  }
});


export default router;
