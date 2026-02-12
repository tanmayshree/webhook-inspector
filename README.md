# Livehook Inspector

A simple, real-time livehook inspector built with Node.js, Express, MongoDB, and EJS.

## Features

- Inspect HTTP requests sent to unique endpoints.
- View headers, query parameters, body (JSON, text, raw), and more.
- Real-time updates via polling.
- Pagination logic to browse past requests.
- Clean, dark-mode UI.

## Prerequisites

- Node.js (v14 or later)
- MongoDB (running locally on default port 27017)

## Installation

1.  Clone/Download the project.
2.  Install dependencies:
    ```bash
    npm install
    ```

## Usage

1.  Start MongoDB if it's not already running.
2.  Start the server:
    ```bash
    npm start
    # or
    node server.js
    ```
3.  Open your browser and navigate to:
    `http://localhost:3000/view/YOUR_ENDPOINT_ID`
    Replace `YOUR_ENDPOINT_ID` with any string (e.g., `demo`, `test-123`).

## Sending Requests

Send livehooks to:
`http://localhost:3000/YOUR_ENDPOINT_ID`

Example using cURL:

```bash
curl -X POST -H "Content-Type: application/json" -d '{"message": "Hello World"}' http://localhost:3000/demo
```
