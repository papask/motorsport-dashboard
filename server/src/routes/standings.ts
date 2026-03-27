import { Router } from 'express';
import { getDriverStandings, getConstructorStandings } from '../services/jolpicaService';

const router = Router();

// GET /api/standings/drivers/:year
router.get('/drivers/:year', async (req, res) => {
  try {
    const data = await getDriverStandings(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Driver standings error:', error.message);
    res.status(500).json({ error: '드라이버 스탠딩 데이터를 가져올 수 없습니다.' });
  }
});

// GET /api/standings/constructors/:year
router.get('/constructors/:year', async (req, res) => {
  try {
    const data = await getConstructorStandings(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Constructor standings error:', error.message);
    res.status(500).json({ error: '컨스트럭터 스탠딩 데이터를 가져올 수 없습니다.' });
  }
});

export default router;
