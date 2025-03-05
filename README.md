# PostHog Traffic Simulator

A tool to simulate user traffic for PostHog applications, useful for testing feature flags, events, and analytics.

## Requirements

- Node.js
- Python 3
- PostHog instance

## Installation

1. Clone the repository:

   ```
   git clone https://github.com/andehen/posthog-traffic-simulator.git
   cd posthog-traffic-simulator
   ```

2. Install Node.js dependencies:
   ```
   npm install
   ```

## Configuration

Set the following environment variables:

- `POSTHOG_API_KEY`: Your PostHog API key
- `FEATURE_FLAG_KEY`: Feature flag key to test (default: "test-anon-2")
- `API_HOST`: PostHog API host (default: "http://localhost:8010")
- `PORT`: Port for the test server (default: 5001)

## Usage

1. Start the test server:

   ```
   python serve.py
   ```

2. Run the traffic simulator:
   ```
   node simluate-traffic.js
   ```

### Parameters

Adjust simulation parameters in `simluate-traffic.js`:

- `NUM_BROWSERS`: Number of browser instances to create
- `ITERATIONS_PER_BROWSER`: Number of page loads per browser
- `MAX_CONCURRENT_BROWSERS`: Maximum concurrent browser instances

## How It Works

The simulator uses Puppeteer to launch headless Chrome browsers that visit your PostHog-instrumented page. It rotates user agents and manages concurrency to create realistic traffic patterns.
