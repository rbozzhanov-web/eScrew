# AIMS Parser Integration Guide

Integrate the backend AIMS parser with your React Native eScrew application.

## Architecture

```
eScrew App (React Native)
    ↓ uses
ScheduleLoader Component
    ↓ calls
useAimsSchedule Hook
    ↓ uses
AimsApiClient
    ↓ HTTP requests
AIMS Parser API (FastAPI, Port 8000)
    ↓ parses
AIMS eCrew (aims.airastana.com)
```

## Setup

### 1. Start the Parser Backend

```bash
cd eScrew
docker-compose up -d
```

Verify it's running:
```bash
curl http://localhost:8000/health
# {"status":"ok","app_name":"AIMS eCrew Parser","app_version":"1.0.0"}
```

### 2. Configure Your Credentials

The app needs your AIMS username and password. Choose one approach:

#### Option A: Environment Variable (Development)
```bash
export AIMS_USERNAME="your_username"
export AIMS_PASSWORD="your_password"
```

#### Option B: Redux/Context (Recommended for App)
```typescript
import { createContext, useState } from 'react';

export const AimsContext = createContext<{
  username: string;
  password: string;
  setCredentials: (username: string, password: string) => void;
} | null>(null);

export function AimsProvider({ children }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <AimsContext.Provider
      value={{
        username,
        password,
        setCredentials: (u, p) => {
          setUsername(u);
          setPassword(p);
        }
      }}
    >
      {children}
    </AimsContext.Provider>
  );
}
```

### 3. Use in Your Component

#### Simple Usage (Hook):
```tsx
import { useAimsSchedule } from '@/src/components/useAimsSchedule';
import { useEffect } from 'react';

function MyScheduleScreen() {
  const { roster, loading, error, fetchSchedule } = useAimsSchedule({
    username: 'your_username',
    password: 'your_password'
  });

  useEffect(() => {
    fetchSchedule('2026-09-03', '2026-09-10');
  }, []);

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error}</Text>;

  return (
    <View>
      {roster?.duties.map(duty => (
        <Text key={duty.date}>{duty.date}: {duty.flights.length} flights</Text>
      ))}
    </View>
  );
}
```

#### With Component (Recommended):
```tsx
import { ScheduleLoader } from '@/src/components/ScheduleLoader';

export function MyScheduleScreen() {
  return (
    <ScheduleLoader
      username="your_username"
      password="your_password"
      startDate="2026-09-03"
      endDate="2026-09-10"
      apiBaseUrl="http://localhost:8000"
      onScheduleLoaded={() => console.log('Schedule loaded!')}
    />
  );
}
```

## API Details

### AimsApiClient

```typescript
import { AimsApiClient } from '@/src/aims/apiClient';

const client = new AimsApiClient(
  'http://localhost:8000',
  'username',
  'password'
);

// Get roster
const roster = await client.getRoster('2026-09-03', '2026-09-10');

// Test auth
const isAuth = await client.testAuth();

// Check health
const isHealthy = await client.isHealthy();
```

### Response Format

```typescript
{
  period: {
    start: '2026-09-03',
    end: '2026-09-10'
  },
  duties: [
    {
      date: '2026-09-03',
      flights: [
        {
          flightNumber: 'AE123',
          date: '2026-09-03',
          origin: 'ALA',
          destination: 'NUR',
          departure: '14:30',
          arrival: '16:45',
          aircraftType: 'A320',
          crew: [
            {
              name: 'John Doe',
              role: 'Flight deck',
              position: 'Captain'
            }
          ]
        }
      ]
    }
  ]
}
```

## State Management

The component automatically saves data to local storage via `importNormalizedRoster()`.

To access saved roster:
```typescript
import { getNormalizedRoster } from '@/src/core/rosterStorage';

const roster = getNormalizedRoster();
```

## Error Handling

```typescript
const { error, fetchSchedule } = useAimsSchedule({ username, password });

if (error) {
  if (error.includes('Authentication')) {
    // Show login screen
  } else if (error.includes('API')) {
    // Show "start backend" message
  } else {
    // Show generic error
  }
}
```

## Common Errors

### "AIMS Parser API is not reachable"
**Solution**: Start the backend
```bash
docker-compose up -d
```

### "Authentication failed"
**Solution**: Check credentials
```bash
curl -X POST http://localhost:8000/api/auth/test \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}'
```

### "No flights in response"
**Solution**: Date range has no scheduled flights, try different dates

## Network Configuration

### Production (AWS)
Update API URL in component:
```tsx
<ScheduleLoader
  apiBaseUrl="https://your-parser.example.com"
  ...
/>
```

### Local Development
API URL defaults to `http://localhost:8000`

### Docker on Same Machine
Use `http://host.docker.internal:8000` (Mac/Windows) or `http://172.17.0.1:8000` (Linux)

### WebView in Native App
If running in WebView, use IP address instead of localhost:
```bash
# Get your machine's IP
ipconfig getifaddr en0  # Mac
hostname -I             # Linux
ipconfig                # Windows

# Use in app
apiBaseUrl="http://192.168.1.100:8000"
```

## Credential Security

### Never hardcode credentials!

✅ **Good:**
```typescript
// User enters via form
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
```

❌ **Bad:**
```typescript
const username = 'john@example.com'; // Don't do this!
```

### Use Secure Storage
For production:
```typescript
import * as SecureStore from 'expo-secure-store';

// Save
await SecureStore.setItemAsync('aims_username', username);
await SecureStore.setItemAsync('aims_password', password);

// Retrieve
const username = await SecureStore.getItemAsync('aims_username');
const password = await SecureStore.getItemAsync('aims_password');
```

## Performance Tips

1. **Cache results**: Component automatically saves to local storage
2. **Reduce requests**: Use date ranges instead of fetching daily
3. **Async loading**: Use `onScheduleLoaded` callback for dependent operations
4. **Pagination**: For large date ranges, split into weekly chunks:

```typescript
async function fetchByWeeks(startDate, endDate) {
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current < end) {
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 7);

    await fetchSchedule(
      current.toISOString().split('T')[0],
      Math.min(weekEnd, end).toISOString().split('T')[0]
    );

    current = new Date(weekEnd);
  }
}
```

## Testing

```typescript
import { AimsApiClient } from '@/src/aims/apiClient';

// Test auth works
const client = new AimsApiClient('http://localhost:8000', 'user', 'pass');
expect(await client.testAuth()).toBe(true);

// Test roster format
const roster = await client.getRoster('2026-09-03', '2026-09-10');
expect(roster.period.start).toBe('2026-09-03');
expect(roster.duties.length).toBeGreaterThan(0);
```

## Next Steps

1. ✅ Start backend: `docker-compose up -d`
2. ✅ Import `ScheduleLoader` component
3. ✅ Pass your AIMS credentials
4. ✅ Handle loading/error states
5. ✅ Test with different date ranges
6. ✅ Deploy backend to AWS (production)

## Support

See `README_PARSER.md` for backend troubleshooting.

Questions? Check `docs/aims-parser/TECHNICAL_SPEC.html` for API reference.
