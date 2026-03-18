const axios = require("axios");

exports.searchMutualFunds = async (req, res) => {
  try {

    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    const response = await axios.get(
      `https://api.mfapi.in/mf/search?q=${q}`
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("Mutual fund search error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to search mutual funds",
      error: error.message
    });
  }
};

exports.getLatestNAV = async (req, res) => {
  try {

    const { schemeCode } = req.params;

    if (!schemeCode) {
      return res.status(400).json({
        success: false,
        message: "Scheme code is required"
      });
    }

    const response = await axios.get(
      `https://api.mfapi.in/mf/${schemeCode}/latest`
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("NAV fetch error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch latest NAV",
      error: error.message
    });
  }
};

exports.getNAVRange = async (req, res) => {
  try {

    const { schemeCode } = req.params;
    const { startDate, endDate } = req.query;

    if (!schemeCode) {
      return res.status(400).json({
        success: false,
        message: "Scheme code is required"
      });
    }

    const response = await axios.get(
      `https://api.mfapi.in/mf/${schemeCode}`,
      {
        params: {
          startDate,
          endDate
        }
      }
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("NAV range fetch error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch NAV range",
      error: error.message
    });
  }
};