import { Router } from 'express';
import { getRaceResults, getLastRaceResults } from '../services/jolpicaService';

const router = Router();

// GET /api/results/last
router.get('/last', async (_req, res) => {
  try {
    const data = await getLastRaceResults();
    res.json(data);
  } catch (error: any) {
    console.error('Last race results error:', error.message);
    res.status(500).json({ error: '최근 레이스 결과를 가져올 수 없습니다.' });
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
    res.status(500).json({ error: '레이스 결과 데이터를 가져올 수 없습니다.' });
  }
});

export default router;
