const express = require("express");
const router = express.Router();
const {
  createUserFull,
  getAllUsersDetails,
  updateUserStatus,
} = require("../../controllers/admin/userCreation");

router.post("/create-user", createUserFull);
router.get("/get-all-users", getAllUsersDetails);
router.patch("/user/:id/status", updateUserStatus);

module.exports = router;