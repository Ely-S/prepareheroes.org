# Testing Guide

This project includes comprehensive unit tests and integration tests for the Cloudflare Worker.

## Test Structure

```
worker.test.js              - Unit tests (mocked, no real API calls)
worker.integration.test.js  - Integration tests (real Copper API calls)
```

## Running Tests

### Install Dependencies

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Unit Tests Only

```bash
npm run test:unit
```

Unit tests are fast and don't require any API credentials. They use mocked responses to test:
- CORS handling
- HTTP method validation
- Form data validation
- Copper API payload construction
- Error handling
- Package type handling
- Custom field mapping

**Output:**
```
✓ worker.test.js (24 tests) 161ms
  Test Files  1 passed (1)
       Tests  24 passed (24)
```

### Run Integration Tests

Integration tests create, validate, and delete real opportunities in Copper CRM.

**Prerequisites:**
1. Valid Copper API credentials
2. `.dev.vars` file with your credentials:

```bash
COPPER_API_KEY=your_api_key_here
COPPER_USER_EMAIL=your_email@example.com
```

**Run the test:**

```bash
npm run test:integration
```

**What it does:**
1. Creates a test opportunity via the worker
2. Fetches the opportunity from Copper to validate it exists
3. Verifies all form data was properly saved
4. Deletes the opportunity to clean up
5. Confirms the deletion was successful

**Expected output:**
```
--- Starting Integration Test ---
[Step 1] Creating opportunity via worker...
✓ Opportunity created with ID: 36564532

[Step 2] Validating opportunity exists in Copper...
✓ Opportunity validated successfully

[Step 3] Deleting opportunity to clean up...
✓ Opportunity 36564532 deleted successfully

[Step 4] Verifying opportunity is deleted...
✓ Confirmed opportunity is deleted

--- Integration Test Completed Successfully ---
```

### Run Tests in Watch Mode

For development, you can run tests in watch mode (re-runs when files change):

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

This generates a coverage report showing which parts of the code are tested.

## Test Coverage

Current test coverage:

### Unit Tests (24 tests)

1. **CORS Handling** (2 tests)
   - OPTIONS preflight requests
   - CORS headers in POST responses

2. **HTTP Method Validation** (3 tests)
   - Reject GET requests
   - Reject PUT requests
   - Accept POST requests

3. **Form Data Validation** (4 tests)
   - Require firstName
   - Require lastName
   - Require email
   - Accept valid requests

4. **Copper CRM API Integration** (4 tests)
   - Correct API headers
   - Opportunity name format
   - Form data in details
   - API error handling
   - Success response format

5. **Package Type Handling** (4 tests)
   - Will package
   - Individual trust
   - Couples trust
   - Trust update
   - Default to will when missing

6. **Error Handling** (3 tests)
   - Network errors
   - Malformed JSON
   - API timeouts

7. **Custom Fields** (1 test)
   - Custom field mapping

8. **Responder Status** (2 tests)
   - Active/retired responders with DSW
   - Civilians without DSW

### Integration Tests (2 tests)

1. **Full Workflow Test**
   - Create → Validate → Delete

2. **API Connection Test**
   - Verify credentials work

## Debugging Tests

### View Detailed Error Messages

Tests automatically log errors to console. The stderr output in test results shows expected errors from error-handling tests - these are not failures.

### Run a Single Test

```bash
npx vitest run -t "test name here"
```

Example:
```bash
npx vitest run -t "should create opportunity with correct name format"
```

### Enable Debug Logging

Add `console.log` statements in the worker code or tests to see detailed execution flow.

## Writing New Tests

### Add a Unit Test

Edit `worker.test.js`:

```javascript
it('should do something', async () => {
  // Mock fetch if needed
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: 123 })
  });

  // Create request
  const request = createMockRequest('POST', validFormData);

  // Call worker
  const response = await worker.fetch(request, mockEnv);

  // Assert
  expect(response.status).toBe(200);
});
```

### Add an Integration Test

Edit `worker.integration.test.js`:

```javascript
it('should test something with real API', async () => {
  // Create test data
  const testData = { ...validFormData };

  // Call real API via worker
  const request = createMockRequest('POST', testData);
  const response = await worker.fetch(request, env);

  // Validate
  const result = await response.json();
  expect(result.success).toBe(true);

  // Clean up
  await deleteOpportunity(result.opportunityId);
});
```

## Continuous Integration

To run tests in CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Install dependencies
  run: npm install

- name: Run unit tests
  run: npm run test:unit

- name: Run integration tests
  run: npm run test:integration
  env:
    COPPER_API_KEY: ${{ secrets.COPPER_API_KEY }}
    COPPER_USER_EMAIL: ${{ secrets.COPPER_USER_EMAIL }}
```

## Troubleshooting

### "Missing required environment variables" Error

Make sure `.dev.vars` exists and contains:
```
COPPER_API_KEY=your_key
COPPER_USER_EMAIL=your_email
```

### Integration Test Fails to Delete

The cleanup function runs in `afterAll`, so even if the test fails, it will attempt to delete the test opportunity. If you see orphaned test opportunities in Copper, they'll have names like:
```
IntegrationTest User1765586058098 - Will Package
```

You can safely delete them manually.

### Network Timeout in Integration Test

Increase the test timeout in the test file:
```javascript
it('test name', async () => {
  // test code
}, 60000); // 60 second timeout
```

### API Rate Limiting

If you run integration tests frequently, you may hit Copper's rate limits. Unit tests don't count against limits since they don't call the real API.

## Best Practices

1. **Run unit tests frequently** - They're fast and don't use API quota
2. **Run integration tests before deployment** - Verify real API integration
3. **Keep credentials secure** - Never commit `.dev.vars` to git
4. **Clean up test data** - Integration tests auto-cleanup, but verify
5. **Mock external calls** - Unit tests should never hit real APIs

## Need Help?

- Check test output for specific error messages
- Review the test files for examples
- Ensure your Copper credentials are valid
- Verify your internet connection for integration tests
