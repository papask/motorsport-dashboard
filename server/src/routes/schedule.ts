import { Router } from 'express';
import { getSeasonSchedule } from '../services/jolpicaService';
import { sendRouteError } from '../utils/errorResponse';

const router = Router();

// GET /api/schedule/:year
router.get('/:year', async (req, res) => {
  try {
    const data = await getSeasonSchedule(req.params.year);
    res.json(data);
  } catch (error: any) {
    console.error('Schedule error:', error.message);
    sendRouteError(res, error, '레이스 스케줄 데이터를 가져올 수 없습니다.');
  }
});

export default router;
