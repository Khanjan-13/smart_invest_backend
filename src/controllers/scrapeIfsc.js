const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeAllBanks() {
  const url = "https://banksin.in";

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const $ = cheerio.load(data);
  const banks = [];

  $("tr").each((i, el) => {
    const bankLink = $(el).find("td:nth-child(3) a");
    if (bankLink.length === 0) return;

    const bankName = bankLink.text().trim();
    const bankPage = bankLink.attr("href");

    let logoUrl = $(el).find("td:nth-child(2) img").attr("src");

    if (logoUrl && logoUrl.startsWith("/")) {
      logoUrl = `https://banksin.in${logoUrl}`;
    }

    banks.push({
      bank_name: bankName,
      bank_url: bankPage ? bankPage : null,
      logo_url: logoUrl || null
    });
  });

  return banks;
}

module.exports = { scrapeAllBanks };
