const express = require("express");
const router = express.Router();
const { createUserFull, getAllUsersDetails } = require("../../controllers/admin/userCreation");

router.post("/create-user", createUserFull);
router.get("/get-all-users", getAllUsersDetails);
module.exports = router;