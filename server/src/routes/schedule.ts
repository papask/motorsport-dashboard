import { Router } from 'express';
import { getSeasonSchedule } from '../services/jolpicaService';

const router = Router();

// GET /api/schedule/:year
router.get('/:year', async (req, res) => {
  try {
    const data = await getSeasonSchedule(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Schedule error:', error.message);
    res.status(500).json({ error: '레이스 스케줄 데이터를 가져올 수 없습니다.' });
  }
});

export default router;
