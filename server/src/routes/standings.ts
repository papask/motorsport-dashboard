import { Router } from 'express';
import { getDriverStandings, getConstructorStandings, getDriverStandingsHistory, getConstructorStandingsHistory, getSeasonSchedule } from '../services/jolpicaService';
import { isClinched } from '../services/guideRules';
import { sendRouteError } from '../utils/errorResponse';

const router = Router();

// Marks a table whose leader can no longer be caught
async function withClinched(data: any, year: string, kind: 'driver' | 'constructor') {
  const [first, second] = data.standings;
  if (!first) return { ...data, clinched: false };
  const { races } = await getSeasonSchedule(year);
  return { ...data, clinched: isClinched(first.points - (second?.points ?? 0), races, Number(data.round), Number(year), kind) };
}

// GET /api/standings/drivers/:year/history
router.get('/drivers/:year/history', async (req, res) => {
  try {
    const data = await getDriverStandingsHistory(req.params.year);
    res.json(await withClinched(data, req.params.year, 'driver'));
  } catch (error: any) {
    console.error('Driver standings history error:', error.message);
    sendRouteError(res, error, '드라이버 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/standings/constructors/:year/history
router.get('/constructors/:year/history', async (req, res) => {
  try {
    const data = await getConstructorStandingsHistory(req.params.year);
    res.json(await withClinched(data, req.params.year, 'constructor'));
  } catch (error: any) {
    console.error('Constructor standings history error:', error.message);
    sendRouteError(res, error, '컨스트럭터 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/standings/drivers/:year
router.get('/drivers/:year', async (req, res) => {
  try {
    const data = await getDriverStandings(req.params.year);
    res.json(await withClinched(data, req.params.year, 'driver'));
  } catch (error: any) {
    console.error('Driver standings error:', error.message);
    sendRouteError(res, error, '드라이버 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/standings/constructors/:year
router.get('/constructors/:year', async (req, res) => {
  try {
    const data = await getConstructorStandings(req.params.year);
    res.json(await withClinched(data, req.params.year, 'constructor'));
  } catch (error: any) {
    console.error('Constructor standings error:', error.message);
    sendRouteError(res, error, '컨스트럭터 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

export default router;
