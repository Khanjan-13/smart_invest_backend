const express = require("express");
const router = express.Router();
const { createUserFull } = require("../../controllers/admin/userCreation");

router.post("/create-user", createUserFull);

module.exports = router;