import { Router } from 'express';
import { getTelemetry, getIncidents, getSessions, getDrivers } from '../services/fastf1Service';

const router = Router();

// GET /api/telemetry/sessions/:year/:round
router.get('/sessions/:year/:round', async (req, res) => {
  try {
    const data = await getSessions(req.params.year, req.params.round);
    res.json(data);
  } catch (error: any) {
    console.error('Sessions error:', error.message);
    res.status(500).json({ error: '세션 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/drivers/:year/:round
router.get('/drivers/:year/:round', async (req, res) => {
  try {
    const data = await getDrivers(req.params.year, req.params.round);
    res.json(data);
  } catch (error: any) {
    console.error('Drivers error:', error.message);
    res.status(500).json({ error: '드라이버 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/:year/:round/:driverNumber
router.get('/:year/:round/:driverNumber', async (req, res) => {
  try {
    const data = await getTelemetry(req.params.year, req.params.round, req.params.driverNumber);
    res.json(data);
  } catch (error: any) {
    console.error('Telemetry error:', error.message);
    res.status(500).json({ error: '텔레메트리 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/incidents/:year/:round
router.get('/incidents/:year/:round', async (req, res) => {
  try {
    const data = await getIncidents(req.params.year, req.params.round);
    res.json(data);
  } catch (error: any) {
    console.error('Incidents error:', error.message);
    res.status(500).json({ error: '인시던트 데이터를 가져올 수 없습니다.' });
  }
});

export default router;
