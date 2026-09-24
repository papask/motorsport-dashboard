import { Router } from 'express';
import { getTelemetry, getIncidents, getSessions, getDrivers, getAvailability } from '../services/fastf1Service';

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

// GET /api/telemetry/incidents/:year/:round
// NOTE: must be declared BEFORE the generic "/:year/:round/:driverNumber" route
// below — otherwise Express matches "incidents/2024/1" as year=incidents and
// routes it to the telemetry handler.
router.get('/incidents/:year/:round', async (req, res) => {
  try {
    const data = await getIncidents(req.params.year, req.params.round);
    res.json(data);
  } catch (error: any) {
    console.error('Incidents error:', error.message);
    res.status(500).json({ error: '인시던트 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/telemetry/availability/:year/:round?session=R
// Declared before the generic "/:year/:round/:driverNumber" route below, which
// would otherwise swallow it as year="availability".
//
// A failure here is not an error for the caller: not knowing whether telemetry
// exists is the same position they were in before asking, so it answers 200
// with every flag false rather than making the page handle a 500.
router.get('/availability/:year/:round', async (req, res) => {
  const session = (req.query.session as string) || 'R';
  try {
    const data = await getAvailability(req.params.year, req.params.round, session);
    res.json(data);
  } catch (error: any) {
    console.error('Availability error:', error.message);
    res.json({
      year: Number(req.params.year),
      round: Number(req.params.round),
      session,
      results: false,
      lapTimes: false,
      telemetry: false,
      reason: `check_failed: ${error.message}`,
    });
  }
});

// GET /api/telemetry/:year/:round/:driverNumber
router.get('/:year/:round/:driverNumber', async (req, res) => {
  try {
    const data = await getTelemetry(req.params.year, req.params.round, req.params.driverNumber, req.query.lap as string | undefined);
    res.json(data);
  } catch (error: any) {
    console.error('Telemetry error:', error.message);
    res.status(500).json({ error: '텔레메트리 데이터를 가져올 수 없습니다.' });
  }
});

export default router;
