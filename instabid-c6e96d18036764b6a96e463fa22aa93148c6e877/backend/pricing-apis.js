const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');

const BLS_API_KEY = process.env.BLS_API_KEY || 'your_bls_api_key_here';
const BLS_BASE_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

/**
 * BLS Series IDs for construction labor rates by trade
 * Format: OEUN + MSA_CODE + 0000000 + OCCUPATION_CODE
 */
const BLS_OCCUPATION_CODES = {
  roofing: '472181',      // Roofers
  hvac: '472110',         // HVAC Mechanics and Installers
  electrical: '472111',   // Electricians
  plumbing: '472152',     // Plumbers, Pipefitters, and Steamfitters
  flooring: '472042',     // Floor Layers, Except Carpet, Wood, and Hard Tiles
  painting: '472141',     // Painters, Construction and Maintenance
  general: '472061'       // Construction Laborers
};

/**
 * Fetch BLS labor rate data for a specific trade and MSA
 */
async function fetchBLSLaborRate(msaCode, tradeType) {
  try {
    const occupationCode = BLS_OCCUPATION_CODES[tradeType];
    if (!occupationCode) {
      throw new Error(`Unknown trade type: ${tradeType}`);
    }

    // Construct BLS series ID: OEUN + MSA + 0000000 + OCCUPATION
    const seriesId = `OEUN${msaCode}0000000${occupationCode}`;
    
    const response = await axios.post(
      BLS_BASE_URL,
      {
        seriesid: [seriesId],
        startyear: new Date().getFullYear().toString(),
        endyear: new Date().getFullYear().toString(),
        registrationkey: BLS_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    if (response.data.status === 'REQUEST_SUCCEEDED' && response.data.Results.series.length > 0) {
      const series = response.data.Results.series[0];
      if (series.data && series.data.length > 0) {
        // Return most recent hourly wage
        const hourlyRate = parseFloat(series.data[0].value);
        return {
          hourlyRate,
          source: 'BLS',
          msaCode,
          tradeType,
          seriesId,
          lastUpdated: new Date().toISOString()
        };
      }
    }

    // Fall back to national average if MSA data not available
    return fetchNationalBLSRate(tradeType);

  } catch (error) {
    console.error(`BLS API error for ${tradeType} in MSA ${msaCode}:`, error.message);
    return fetchNationalBLSRate(tradeType);
  }
}

/**
 * Fetch national average labor rate when MSA data is unavailable
 */
async function fetchNationalBLSRate(tradeType) {
  try {
    const occupationCode = BLS_OCCUPATION_CODES[tradeType];
    const nationalSeriesId = `OEUN000000000000${occupationCode}`;
    
    const response = await axios.post(
      BLS_BASE_URL,
      {
        seriesid: [nationalSeriesId],
        startyear: new Date().getFullYear().toString(),
        endyear: new Date().getFullYear().toString(),
        registrationkey: BLS_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    if (response.data.status === 'REQUEST_SUCCEEDED' && response.data.Results.series.length > 0) {
      const series = response.data.Results.series[0];
      if (series.data && series.data.length > 0) {
        const hourlyRate = parseFloat(series.data[0].value);
        return {
          hourlyRate,
          source: 'BLS_NATIONAL',
          tradeType,
          seriesId: nationalSeriesId,
          lastUpdated: new Date().toISOString()
        };
      }
    }

    // Ultimate fallback to hardcoded rates
    return getFallbackRate(tradeType);

  } catch (error) {
    console.error(`National BLS API error for ${tradeType}:`, error.message);
    return getFallbackRate(tradeType);
  }
}

/**
 * Hardcoded fallback rates when all API calls fail
 */
function getFallbackRate(tradeType) {
  const fallbackRates = {
    roofing: 28.50,
    hvac: 32.75,
    electrical: 35.20,
    plumbing: 34.80,
    flooring: 26.40,
    painting: 24.60,
    general: 22.90
  };

  return {
    hourlyRate: fallbackRates[tradeType] || 25.00,
    source: 'FALLBACK',
    tradeType,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Scrape HomeAdvisor for material pricing (fallback method)
 */
async function scrapeHomeAdvisorPricing(searchTerm) {
  try {
    const searchUrl = `https://www.homeadvisor.com/cost/${encodeURIComponent(searchTerm)}/`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    
    // Extract pricing data from HomeAdvisor's cost guides
    const priceData = {
      lowPrice: null,
      highPrice: null,
      averagePrice: null,
      source: 'HomeAdvisor'
    };

    // Try to find price ranges in common HomeAdvisor formats
    $('.cost-guide-price, .price-range, [data-testid="price"]').each((i, el) => {
      const text = $(el).text();
      const priceMatch = text.match(/\$([0-9,]+)/g);
      if (priceMatch && priceMatch.length >= 2) {
        priceData.lowPrice = parseFloat(priceMatch[0].replace(/[$,]/g, ''));
        priceData.highPrice = parseFloat(priceMatch[1].replace(/[$,]/g, ''));
        priceData.averagePrice = (priceData.lowPrice + priceData.highPrice) / 2;
      }
    });

    return priceData;

  } catch (error) {
    console.error(`HomeAdvisor scraping error for ${searchTerm}:`, error.message);
    return null;
  }
}

/**
 * Get comprehensive pricing data for a trade in a specific location
 */
async function getTradePricing(zipCode, msaCode, tradeType) {
  try {
    // Fetch labor rate from BLS
    const laborData = await fetchBLSLaborRate(msaCode, tradeType);
    
    // Optionally scrape material pricing
    const materialData = await scrapeHomeAdvisorPricing(`${tradeType} materials`);

    return {
      labor: laborData,
      materials: materialData,
      zipCode,
      msaCode,
      tradeType,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Error fetching trade pricing for ${tradeType}:`, error.message);
    return {
      labor: getFallbackRate(tradeType),
      materials: null,
      zipCode,
      msaCode,
      tradeType,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  fetchBLSLaborRate,
  fetchNationalBLSRate,
  getFallbackRate,
  scrapeHomeAdvisorPricing,
  getTradePricing,
  BLS_OCCUPATION_CODES
};
