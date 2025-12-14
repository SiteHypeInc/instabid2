const cron = require('node-cron');
const pricingCache = require('./pricing-cache');
const pricingAPIs = require('./pricing-apis');
const dataLoader = require('./data/data-loader');

class CronJobs {
  
  constructor() {
    this.jobs = [];
  }

  // Initialize all cron jobs
  init() {
    console.log('🕐 Initializing cron jobs...');
    
    // Weekly refresh: Every Sunday at 2 AM ET
    const weeklyRefresh = cron.schedule('0 2 * * 0', async () => {
      console.log('🔄 Starting weekly county-seat pricing refresh...');
      await this.refreshCountySeats();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });
    
    // Daily cleanup: Every day at 3 AM ET
    const dailyCleanup = cron.schedule('0 3 * * *', async () => {
      console.log('🧹 Running daily cache cleanup...');
      await pricingCache.cleanExpired();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });
    
    this.jobs.push(weeklyRefresh, dailyCleanup);
    
    console.log('✅ Cron jobs initialized');
    console.log('   - Weekly refresh: Sundays at 2 AM ET');
    console.log('   - Daily cleanup: Every day at 3 AM ET');
  }

  // Refresh all 543 county-seat ZIPs in batches
  async refreshCountySeats() {
    try {
      const allZips = await dataLoader.getAllRefreshZips();
      
      console.log(`📍 Refreshing ${allZips.length} county seats...`);
      
      const batchSize = 50;
      const batches = [];
      
      // Split into batches of 50
      for (let i = 0; i < allZips.length; i += batchSize) {
        batches.push(allZips.slice(i, i + batchSize));
      }
      
      let totalRefreshed = 0;
      let totalFailed = 0;
      
      // Process each batch sequentially
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`   Batch ${i + 1}/${batches.length}: ${batch.length} ZIPs`);
        
        const results = await Promise.allSettled(
          batch.map(zip => this.refreshSingleZip(zip))
        );
        
        // Count successes/failures
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value) {
            totalRefreshed++;
          } else {
            totalFailed++;
          }
        });
        
        // Wait 2 seconds between batches to avoid rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      // Calculate quality score (0-100)
      const overallQualityScore = Math.round((totalRefreshed / allZips.length) * 100);
      
      console.log('✅ Weekly refresh complete:');
      console.log(`   - Refreshed: ${totalRefreshed}`);
      console.log(`   - Failed: ${totalFailed}`);
      console.log(`   - Quality Score: ${overallQualityScore}/100`);
      
      return {
        total: allZips.length,
        refreshed: totalRefreshed,
        failed: totalFailed,
        qualityScore: overallQualityScore
      };
      
    } catch (error) {
      console.error('❌ Error in weekly refresh:', error);
      return null;
    }
  }

  // Refresh a single ZIP
  async refreshSingleZip(zipCode) {
    try {
      // Get county info from data loader
      const countyInfo = await dataLoader.getCountyForZip(zipCode);
      
      // Get fresh pricing data from APIs
      const estimate = await pricingAPIs.calculateEstimate(zipCode, 2000);
      
      if (!estimate || !estimate.basePrice) {
        console.log(`   ⚠️  No data for ${zipCode}`);
        return false;
      }
      
      // Merge county info with pricing data
      const cacheData = {
        county: countyInfo?.county || null,
        state: countyInfo?.state || null,
        metro: countyInfo?.metro || null,
        materialMultiplier: estimate.materialMultiplier,
        laborRate: estimate.laborRate,
        permitCost: estimate.permitCost,
        weatherFactor: estimate.weatherFactor,
        dataSources: estimate.dataSources,
        qualityScore: estimate.qualityScore
      };
      
      // Store in cache with 14-day expiry
      await pricingCache.set(zipCode, cacheData, 14);
      
      return true;
      
    } catch (error) {
      console.error(`   ❌ Error refreshing ${zipCode}:`, error.message);
      return false;
    }
  }

  // Manual trigger for testing
  async triggerRefreshNow() {
    console.log('🔄 Manual refresh triggered...');
    return await this.refreshCountySeats();
  }

  // Stop all cron jobs
  stopAll() {
    console.log('🛑 Stopping all cron jobs...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('✅ All cron jobs stopped');
  }
}

module.exports = new CronJobs();
