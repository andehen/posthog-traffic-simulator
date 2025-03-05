const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

// Apply the stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

// Performance tuning parameters
const NUM_BROWSERS = 3;
const ITERATIONS_PER_BROWSER = 10; // Total fetches per browser
const MAX_CONCURRENT_BROWSERS = 3; // Maximum number of browsers to run simultaneously

// Concurrency limiter for browser instances
class ConcurrencyLimiter {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return true;
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next(true);
    } else {
      this.running--;
    }
  }
}

// Common user agents to rotate through
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
];

// Get a random user agent
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Optimized browser launch settings
async function launchBrowserWithRetry(maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage", // Helps with memory issues in Docker
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
          "--disable-infobars",
          "--window-position=0,0",
          "--ignore-certificate-errors",
          "--ignore-certificate-errors-spki-list",
          "--disable-blink-features=AutomationControlled",
        ],
        protocolTimeout: 30000, // Reduce protocol timeout for faster failure
        timeout: 30000,
        defaultViewport: {
          width: 1280,
          height: 720,
        },
      });
      return browser;
    } catch (err) {
      retries++;
      console.error(`Browser launch attempt ${retries} failed:`, err.message);
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (retries >= maxRetries) {
        throw new Error(
          `Failed to launch browser after ${maxRetries} attempts`
        );
      }
    }
  }
}

// Process a batch of iterations using a single page with proper isolation
async function processPageBatch(browser, iterations) {
  const counts = {};
  const distinctIds = {};
  const emailStats = {};

  for (let i = 0; i < iterations; i++) {
    // Create a new incognito context for each iteration to ensure complete isolation
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    try {
      console.log(`Processing iteration ${i + 1}/${iterations}`);

      // Set up page with stealth settings
      await page.setUserAgent(getRandomUserAgent());
      await page.setDefaultNavigationTimeout(20000);

      // Set minimal headers
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      });

      // Set random viewport to further randomize fingerprint
      await page.setViewport({
        width: 1280 + Math.floor(Math.random() * 100),
        height: 720 + Math.floor(Math.random() * 100),
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: false,
        isMobile: false,
      });

      // Navigate to the page
      await page.goto("http://localhost:5001", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });

      // Wait for the feature flag to be available
      await page.waitForFunction(
        () =>
          window.featureFlag !== undefined &&
          window.distinctId !== undefined &&
          window.hadEmail !== undefined,
        { timeout: 5000 }
      );

      // Get feature flag variant, distinct ID, and email status
      const { featureFlag, distinctId, hadEmail } = await page.evaluate(() => ({
        featureFlag: window.featureFlag,
        distinctId: window.distinctId,
        hadEmail: window.hadEmail,
      }));

      // Count the variant
      counts[featureFlag] = (counts[featureFlag] || 0) + 1;

      // Track distinct IDs for each variant
      if (!distinctIds[featureFlag]) {
        distinctIds[featureFlag] = new Set();
      }
      distinctIds[featureFlag].add(distinctId);

      // Track which cases had email set
      if (!emailStats[featureFlag]) {
        emailStats[featureFlag] = { withEmail: 0, withoutEmail: 0 };
      }
      if (hadEmail) {
        emailStats[featureFlag].withEmail += 1;
      } else {
        emailStats[featureFlag].withoutEmail += 1;
      }
    } catch (iterError) {
      console.error(`Error in iteration ${i + 1}:`, iterError.message);
    } finally {
      // Close the incognito context - this ensures complete cleanup of all browsing data
      await page.close();
      await context.close();
    }

    // Add a small delay between iterations to avoid overwhelming the server
    if (i < iterations - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 200)
      );
    }
  }

  // Convert Sets to Arrays for return value
  Object.keys(distinctIds).forEach((key) => {
    distinctIds[key] = Array.from(distinctIds[key]);
  });

  return { counts, distinctIds, emailStats };
}

// Optimized to run multiple iterations with proper isolation
async function fetchFeatureFlag() {
  // Initialize tracking objects
  const variantCounts = {};
  const variantDistinctIds = {};
  const variantHadEmail = {};

  let browser = null;
  try {
    console.log(`Starting browser for ${ITERATIONS_PER_BROWSER} iterations`);
    browser = await launchBrowserWithRetry();

    // Process all the iterations in this browser
    const result = await processPageBatch(browser, ITERATIONS_PER_BROWSER);

    // Transfer results
    Object.entries(result.counts).forEach(([variant, count]) => {
      variantCounts[variant] = count;
    });

    Object.entries(result.distinctIds).forEach(([variant, ids]) => {
      variantDistinctIds[variant] = new Set(ids);
    });

    Object.entries(result.emailStats).forEach(([variant, stats]) => {
      variantHadEmail[variant] = stats;
    });
  } catch (error) {
    console.error("Error in browser session:", error.message);
  } finally {
    // Close the browser when done
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError.message);
      }
    }
  }

  return { variantCounts, variantDistinctIds, variantHadEmail };
}

// Entry point
(async () => {
  try {
    console.log(
      `Running ${NUM_BROWSERS} browsers with max ${MAX_CONCURRENT_BROWSERS} concurrently...`
    );

    const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_BROWSERS);
    const tasks = Array.from({ length: NUM_BROWSERS }, async (_, i) => {
      await limiter.acquire();
      console.log(`Starting browser ${i + 1}/${NUM_BROWSERS}`);
      try {
        return await fetchFeatureFlag();
      } finally {
        limiter.release();
      }
    });

    const results = await Promise.all(tasks);

    // Combine results from all browsers
    let finalCounts = {};
    let finalDistinctIds = {};
    let finalEmailStats = {};

    results.forEach(
      ({ variantCounts, variantDistinctIds, variantHadEmail }) => {
        // Combine variant counts
        Object.keys(variantCounts).forEach((variant) => {
          finalCounts[variant] =
            (finalCounts[variant] || 0) + variantCounts[variant];
        });

        // Combine distinct IDs
        Object.keys(variantDistinctIds).forEach((variant) => {
          if (!finalDistinctIds[variant]) {
            finalDistinctIds[variant] = new Set();
          }

          variantDistinctIds[variant].forEach((id) => {
            finalDistinctIds[variant].add(id);
          });
        });

        // Combine email stats
        Object.keys(variantHadEmail).forEach((variant) => {
          if (!finalEmailStats[variant]) {
            finalEmailStats[variant] = { withEmail: 0, withoutEmail: 0 };
          }
          finalEmailStats[variant].withEmail +=
            variantHadEmail[variant].withEmail;
          finalEmailStats[variant].withoutEmail +=
            variantHadEmail[variant].withoutEmail;
        });
      }
    );

    // Log results for all variants
    console.log("Results by variant:");
    Object.entries(finalCounts).forEach(([variant, count]) => {
      const distinctIdCount = finalDistinctIds[variant]
        ? finalDistinctIds[variant].size
        : 0;
      console.log(
        `${variant}: ${count} occurrences with ${distinctIdCount} distinct IDs`
      );

      // Add email statistics
      if (finalEmailStats[variant]) {
        const withEmail = finalEmailStats[variant].withEmail;
        const withoutEmail = finalEmailStats[variant].withoutEmail;
        console.log(
          `  - With email: ${withEmail} (${Math.round(
            (withEmail / count) * 100
          )}%)`
        );
        console.log(
          `  - Without email: ${withoutEmail} (${Math.round(
            (withoutEmail / count) * 100
          )}%)`
        );
      }
    });

    // Optionally, log all the distinct IDs for each variant
    console.log("\nDistinct IDs by variant:");
    Object.entries(finalDistinctIds).forEach(([variant, idSet]) => {
      console.log(`${variant}: ${Array.from(idSet).join(", ")}`);
    });
  } catch (mainError) {
    console.error("Fatal error in main execution:", mainError);
  }
})();
