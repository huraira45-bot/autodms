const express = require('express');
const router = express.Router();
const c = require('../controllers/crdController');

const requireCRD = (req, res, next) => {
    if (!req.user?.modules?.includes('crd_followups')) {
        return res.status(403).json({ error: 'Access denied: crd_followups module required.' });
    }
    next();
};

router.get('/follow-ups/stats', requireCRD, c.stats);
router.get('/follow-ups',       requireCRD, c.list);
router.get('/follow-ups/:id',   requireCRD, c.get);
router.put('/follow-ups/:id',   requireCRD, c.update);

module.exports = router;
