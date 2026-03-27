import { Router } from 'express';
import { getDrivers } from '../services/openf1Service';

const router = Router();

// GET /api/drivers/:sessionKey
router.get('/:sessionKey', async (req, res) => {
  try {
    const data = await getDrivers(parseInt(req.params.sessionKey));
    res.json(data);
  } catch (error: any) {
    console.error('Drivers error:', error.message);
    res.status(500).json({ error: '드라이버 데이터를 가져올 수 없습니다.' });
  }
});

export default router;
