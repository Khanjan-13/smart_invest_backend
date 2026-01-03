const bcrypt = require("bcryptjs");

exports.hashPin = async (pin) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(pin, salt);
};

exports.verifyPin = async (pin, hash) => {
  return await bcrypt.compare(pin, hash);
};
