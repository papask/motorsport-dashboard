import { Router } from 'express';
import { getDriverStandings, getConstructorStandings, getDriverStandingsHistory, getConstructorStandingsHistory } from '../services/jolpicaService';
import { sendRouteError } from '../utils/errorResponse';

const router = Router();

// GET /api/standings/drivers/:year/history
router.get('/drivers/:year/history', async (req, res) => {
  try {
    const data = await getDriverStandingsHistory(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Driver standings history error:', error.message);
    sendRouteError(res, error, '드라이버 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/standings/constructors/:year/history
router.get('/constructors/:year/history', async (req, res) => {
  try {
    const data = await getConstructorStandingsHistory(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Constructor standings history error:', error.message);
    sendRouteError(res, error, '컨스트럭터 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/standings/drivers/:year
router.get('/drivers/:year', async (req, res) => {
  try {
    const data = await getDriverStandings(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Driver standings error:', error.message);
    sendRouteError(res, error, '드라이버 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

// GET /api/standings/constructors/:year
router.get('/constructors/:year', async (req, res) => {
  try {
    const data = await getConstructorStandings(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Constructor standings error:', error.message);
    sendRouteError(res, error, '컨스트럭터 스탠딩 데이터를 가져올 수 없습니다.');
  }
});

export default router;
