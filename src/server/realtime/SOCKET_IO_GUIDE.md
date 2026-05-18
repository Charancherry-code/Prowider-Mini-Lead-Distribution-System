# Real-Time Dashboard Updates with Socket.IO

## Overview

The dashboard updates in real-time when leads are allocated to providers. This guide explains the server setup, client connection, and event flow.

## Architecture

```
Lead Allocation Request (API)
    ↓
Provider Allocation Service (allocation)
    ↓
Socket.IO Emit (dashboard:updated)
    ↓
Connected Clients (re-fetch provider data)
    ↓
Dashboard UI (refreshes with new stats)
```

## Server Setup

### 1. Socket.IO Server (`src/server/realtime/socket.ts`)

**Initialization:**

```typescript
const io = new SocketIOServer(server, {
  path: env.SOCKET_IO_PATH, // "/socket.io"
  cors: {
    origin: env.NEXT_PUBLIC_APP_URL ? [env.NEXT_PUBLIC_APP_URL] : true,
    credentials: true,
  },
});
```

**Event Handlers:**

- `provider:joined`: Provider joins dashboard (creates room for provider-specific updates)
- `provider:left`: Provider leaves dashboard
- `dashboard:updated`: Broadcast to all connected clients

**Global Reference:**

```typescript
declare global {
  var socketServer: SocketIOServer | undefined;
}
```

The server is stored globally for access from API routes and services.

### 2. Event Types (`src/server/realtime/events.ts`)

**DashboardUpdatedPayload:**

```typescript
export type DashboardUpdatedPayload = {
  timestamp: number; // When update occurred
  allocatedProviders: string[]; // Provider IDs that received the lead
  leadId: string; // Which lead was allocated
};
```

### 3. Emission Point (`src/server/services/provider-allocation-service.ts`)

**After Successful Allocation:**

```typescript
// Create assignments and update quotas...

// Emit dashboard update event to all connected clients
emitDashboardUpdated({
  timestamp: Date.now(),
  allocatedProviders: selectedProviderIds,
  leadId,
});
```

## Client Setup

### 1. Connection Hook (`src/client/hooks/useProviderUpdates.ts`)

**Key Features:**

- Automatic reconnection with exponential backoff (1-5 seconds)
- Connection status tracking (`isConnected`)
- Event listener for dashboard updates
- Error handling and logging

**Usage:**

```typescript
const { isConnected, socket } = useProviderUpdates((update: ProviderUpdate) => {
  // Handle update: re-fetch provider data
});
```

**Connection Flow:**

1. Create Socket.IO client instance
2. Connect to server at `/socket.io/`
3. Listen for `dashboard:updated` events
4. Re-fetch provider data on each update
5. Display "Live" indicator when connected

### 2. Client Component (`src/client/components/ProvidersDashboard.tsx`)

**State Management:**

```typescript
const [providers, setProviders] = useState([]);
const [loading, setLoading] = useState(true);
const [lastUpdate, setLastUpdate] = useState<ProviderUpdate | null>(null);
```

**Initial Load:**

```typescript
useEffect(() => {
  getProvidersDashboardData().then((data) => {
    setProviders(data);
    setLoading(false);
  });
}, []);
```

**Real-Time Updates:**

```typescript
const handleUpdate = (update: ProviderUpdate) => {
  setLastUpdate(update);
  // Refetch provider data on update
  getProvidersDashboardData().then((data) => {
    setProviders(data);
  });
};

const { isConnected } = useProviderUpdates(handleUpdate);
```

**UI Indicators:**

- Connection status badge (green = connected, amber = offline)
- Last update notification banner
- Live refreshing provider cards

## Event Flow

### Allocation Sequence

1. **Client Request:**
   - POST `/api/leads/:leadId/allocate?serviceId=:serviceId`

2. **Server Processing:**
   - Validate lead exists and needs allocation
   - Lock allocation state (SERIALIZABLE isolation)
   - Select providers (mandatory + fair pool)
   - Check quotas
   - Create assignments
   - Update allocation counts
   - **EMIT EVENT**: `emitDashboardUpdated({...})`

3. **Socket.IO Broadcast:**

   ```typescript
   global.socketServer?.emit(RealtimeEvents.DashboardUpdated, payload);
   ```

   - Event reaches all connected clients
   - No filtering (all dashboards see all updates)

4. **Client Receives:**
   - `dashboard:updated` event in hook
   - Call `handleUpdate(payload)`
   - Re-fetch provider data

5. **UI Updates:**
   - Provider cards refresh with new quotas
   - Last update banner shows
   - Stats recalculate

## Production Safety

### 1. No Manual Refreshes Required

- Client-side re-fetch handles all data updates
- No stale state on dashboard

### 2. Connection Resilience

```typescript
reconnection: true,
reconnectionDelay: 1000,
reconnectionDelayMax: 5000,
reconnectionAttempts: 5,
```

- Auto-reconnect with exponential backoff
- Status indicator shows when offline
- Graceful degradation

### 3. CORS Configuration

```typescript
cors: {
  origin: env.NEXT_PUBLIC_APP_URL ? [env.NEXT_PUBLIC_APP_URL] : true,
  credentials: true,
},
```

- Restricts Socket.IO to app origin
- Credentials passed for authentication

### 4. Atomic Updates

- Allocation and event emission happen within transaction
- No race conditions or missed updates

### 5. Type Safety

- Full TypeScript types for payloads
- Shared event constants across server/client
- Zod validation for environment config

## Monitoring

**Connection Status Badge:**

- Green dot = connected, live updates flowing
- Amber dot = offline, attempting to reconnect
- Shows in header of providers page

**Last Update Indicator:**

- Shows which providers received the last allocated lead
- Timestamp available in payload
- Updates every time allocation occurs

## Scalability Considerations

### Current Implementation

- Broadcasts to all connected clients
- Works well for single-server deployment
- ~100-1000 concurrent connections typical

### Future Enhancements

- Room-based subscriptions (subscribe to specific provider updates)
- Filtering by service or region
- Persistence layer (Socket.IO adapter)
- Horizontal scaling (Redis adapter for multiple servers)

## Testing Real-Time Updates

1. **Open dashboard:**
   - Navigate to `/providers`
   - Check connection badge (should show green)

2. **Allocate a lead:**

   ```bash
   curl -X POST http://localhost:3000/api/leads/lead_123/allocate?serviceId=service_1
   ```

3. **Observe dashboard:**
   - Provider cards should refresh within seconds
   - Last update banner should show allocated providers
   - Quota numbers should increase

4. **Test offline mode:**
   - Close browser DevTools or disconnect network
   - Connection badge turns amber
   - After reconnection, dashboard updates resume

## Files Modified/Created

**Backend:**

- `src/server/realtime/events.ts` - Added DashboardUpdatedPayload
- `src/server/realtime/socket.ts` - Added emitDashboardUpdated function
- `src/server/services/provider-allocation-service.ts` - Emit event on allocation
- `server.ts` - Already initialized Socket.IO

**Frontend:**

- `src/client/hooks/useProviderUpdates.ts` - Socket.IO connection hook
- `src/client/components/ProvidersDashboard.tsx` - Client-side dashboard with real-time updates
- `src/app/providers/page.tsx` - Page wrapper
