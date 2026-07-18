const express = require('express');
const router  = express.Router();
const c       = require('../controllers/chatController');
const { requireAnyAccess, requireAccess } = require('../middleware/permissions');

// Everything requires at least chat_use OR chat_admin.
const canChat  = requireAnyAccess('chat_use', 'chat_admin');
const canAudit = requireAccess('chat_admin');

router.get(  '/users',                        canChat,  c.listUsers);
router.get(  '/channels',                     canChat,  c.listMyChannels);
router.post( '/channels',                     canChat,  c.createChannel);
router.post( '/dm/:userId',                   canChat,  c.getOrCreateDM);
router.get(  '/channels/:id/messages',        canChat,  c.getMessages);
router.post( '/channels/:id/messages',        canChat,  c.sendMessage);
router.post( '/channels/:id/read',            canChat,  c.markRead);

// File uploads — multer middleware handles multipart/form-data. 20 MB cap.
router.post( '/upload',                       canChat,  c.uploadMiddleware, c.uploadAttachment);

// Admin audit
router.get(  '/audit/channels',               canAudit, c.auditListChannels);

module.exports = router;
