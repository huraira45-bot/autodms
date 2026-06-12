const router = require('express').Router();
const auth = require('../middleware/auth');
const { login, me } = require('../controllers/authController');

router.post('/login', login);
router.get('/me', auth, me);

module.exports = router;
