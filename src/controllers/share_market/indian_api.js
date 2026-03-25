const axios = require("axios");
// Store API keys
const apiKeys = [
    process.env.INDIAN_API_KEY_1,
    process.env.INDIAN_API_KEY_2,
    process.env.INDIAN_API_KEY_3
];

exports.getTrendingStocks = async (req, res) => {
  try {

    // Pick random key
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    const response = await axios.get(
      "https://stock.indianapi.in/trending",
      {
        headers: {
          "x-api-key": randomKey
        }
      }
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("Error fetching trending stocks:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch trending stocks",
      error: error.message
    });
  }
};

exports.searchIndustry = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query parameter is required"
      });
    }

    // random API key
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    const response = await axios.get(
      `https://stock.indianapi.in/industry_search?query=${query}`,
      {
        headers: {
          "x-api-key": randomKey
        }
      }
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("Industry search error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch industry search results",
      error: error.message
    });
  }
};

exports.getMutualFunds = async (req, res) => {
  try {

    // pick random api key
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    const response = await axios.get(
      "https://stock.indianapi.in/mutual_funds",
      {
        headers: {
          "x-api-key": randomKey
        }
      }
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("Mutual funds fetch error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch mutual funds",
      error: error.message
    });
  }
};

exports.getHistoricalStockData = async (req, res) => {
  try {
    const { stock_name, period } = req.query;
    // random API key
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    // Validation
    if (!stock_name || !period) {
      return res.status(400).json({
        success: false,
        message: "stock_name and period are required"
      });
    }

    // API URL
    const url = `https://stock.indianapi.in/historical_data?stock_name=${stock_name}&period=${period}&filter=price`;

    const response = await axios.get(url, {
      headers: {
        "X-Api-Key": randomKey
      }
    });

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error("Error fetching stock data:", error?.response?.data || error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch stock data",
      error: error?.response?.data || error.message
    });
  }
};

exports.getMutualFundDetails = async (req, res) => {
  try {
    const { stock_name } = req.query;

    // Random API key
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    // Validation
    if (!stock_name) {
      return res.status(400).json({
        success: false,
        message: "stock_name is required"
      });
    }

    // API URL
    const url = `https://stock.indianapi.in/mutual_funds_details?stock_name=${encodeURIComponent(stock_name)}`;

    const response = await axios.get(url, {
      headers: {
        "X-Api-Key": randomKey
      }
    });

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error(
      "Error fetching mutual fund details:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch mutual fund details",
      error: error?.response?.data || error.message
    });
  }
};
exports.searchMutualFunds = async (req, res) => {
  try {
    const { query } = req.query;

    // Random API key
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    // Validation
    if (!query) {
      return res.status(400).json({
        success: false,
        message: "query is required"
      });
    }

    // API URL
    const url = `https://stock.indianapi.in/mutual_fund_search?query=${encodeURIComponent(query)}`;

    const response = await axios.get(url, {
      headers: {
        "X-Api-Key": randomKey
      }
    });

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error(
      "Error searching mutual funds:",
      error?.response?.data || error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to search mutual funds",
      error: error?.response?.data || error.message
    });
  }
};