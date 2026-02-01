# CSM Host Tab Refactoring Plan

## Obiettivo

Trasformare il tab "Host" da una lista di host configurati staticamente (via SSH in `config.json`) a una lista dinamica di **worker registrati** al master server. Il master server avvia automaticamente un worker sulla propria macchina, eliminando la necessità di configurazione manuale.

### Semantica di "local"

> **"Local" = la macchina dove gira la TUI**, non la macchina del master server.
>
> Se apro la TUI dal MacBook Pro, il MacBook Pro e' "local" — anche se il master
> gira sul Mac Mini. Il Mac Mini appare come worker remoto dal punto di vista
> della TUI sul MacBook Pro.

Questa e' una distinzione **client-side**: il master non sa e non deve sapere
quale worker e' "local". E' la TUI che confronta il proprio hostname con
`hostInfo.hostname` di ogni worker per determinare quale marcare come "(local)".

### Architettura Target

```
Mac Mini                              MacBook Pro
┌──────────────────────┐             ┌──────────────────────┐
│  csm server          │             │  csm worker start    │
│  ├─ API :3000        │◄────────────│  └─ registra al      │
│  └─ Worker co-located│  HTTP push  │     master            │
│     (auto-started)   │             │                      │
└──────────────────────┘             └──────────────────────┘
                                            │
                                     ┌──────┴──────┐
                                     │  csm (TUI)  │
                                     │  "local" =  │
                                     │  MacBook Pro │
                                     └─────────────┘

Dalla TUI su MacBook Pro:
  ● macbook-pro  (local)     <- worker sulla stessa macchina della TUI
  ● mac-mini                 <- worker remoto (anche se ha il master)

Dalla TUI su Mac Mini:
  ● mac-mini  (local)        <- worker sulla stessa macchina della TUI
  ● macbook-pro              <- worker remoto
```

- **Mac Mini**: `csm server` (porta 3000) + worker co-located (auto-start)
- **MacBook Pro**: `csm worker start` (registrazione al master via HTTP)
- **TUI**: puo' girare su qualsiasi macchina; marca come "(local)" il worker il cui hostname corrisponde
- **Opzione**: `csm server --no-worker` per disabilitare il worker co-located del master

---

## 1. Analisi del Codice Esistente

### 1.1 Tab Host (Frontend)

| File | Linee | Ruolo |
|------|-------|-------|
| `src/tui/views/Hosts.tsx` | 333 | UI del tab host: lista, create, edit, delete |
| `src/tui/hooks/useHosts.ts` | 101 | Hook: carica host da config, polling SSH status ogni 30s |
| `src/tui/types.ts` | 106 | State: `hosts: Record<string, HostConfig>`, `hostStatus: Record<string, HostStatusInfo>` |

**Funzionamento attuale:**
- `useHosts` chiama `getHosts()` da `lib/config.ts` per leggere `~/.config/csm/config.json`
- Per ogni host, testa la connessione SSH (`testConnection`) e raccoglie info (`getHostInfo`)
- L'host locale (`__local__`) viene sempre mostrato per primo — determinato staticamente (hardcoded)
- L'utente puo' aggiungere/modificare/eliminare host remoti manualmente
- Keybindings: `c` create, `e` edit, `d` delete, `t` test, `i` install hooks, `r` refresh

**Problema**: Configurazione completamente statica, basata su SSH. Nessuna relazione con il sistema worker/master. Il concetto di "local" e' hardcoded come `__local__` invece di essere derivato dal confronto hostname.

### 1.2 Master Server (Backend)

| File | Linee | Ruolo |
|------|-------|-------|
| `src/api/server.ts` | 194 | HTTP server con endpoints worker-events, worker-sync, health, state |
| `src/commands/server.ts` | 26 | CLI wrapper: avvia il server su porta 3000 |

**Stato in-memory (`MasterState`):**
```typescript
interface MasterState {
  workers: Map<string, { lastHeartbeat: string; sessionCount: number }>;
  events: WorkerEvent[];
  sessions: Map<string, any>;
}
```

**Endpoints:**
- `POST /api/worker-events` - riceve eventi singoli dai worker
- `POST /api/worker-sync` - riceve sync completo
- `GET /api/health` - stato aggregato (count worker, sessioni, eventi)
- `GET /api/state` - dump stato (debug)

**Limitazioni attuali:**
- Il master non sa nulla degli host (OS, RAM, uptime, latenza)
- I worker inviano solo `workerId` e `sessionCount` nell'heartbeat
- Non esiste un endpoint per elencare i worker registrati con dettagli
- Non esiste auto-start del worker co-located

### 1.3 Worker Agent

| File | Linee | Ruolo |
|------|-------|-------|
| `src/worker/worker-agent.ts` | 207 | Logica principale: poll tmux, detect changes, push events |
| `src/worker/master-client.ts` | 86 | Client HTTP verso il master |
| `src/worker/state-manager.ts` | 100 | Persistenza stato locale su JSON |
| `src/worker/types.ts` | 52 | Tipi: WorkerEvent, WorkerState, WorkerConfig |
| `src/commands/worker.ts` | 139 | CLI: start, status, sync, poll |

**Configurazione worker:**
```typescript
interface WorkerConfig {
  workerId: string;           // env CSM_WORKER_ID (default: "mac-mini")
  masterUrl?: string;         // env CSM_MASTER_URL (opzionale)
  stateFile: string;          // ~/.config/csm-worker/state.json
  pollInterval: number;       // 10000ms
  heartbeatInterval: number;  // 30000ms
}
```

**Limitazioni attuali:**
- Il worker non invia info sull'host (OS, RAM, hostname, uptime) nell'heartbeat
- Non esiste un evento `worker_registered` / `worker_deregistered`
- Il workerId di default e' hardcoded a `"mac-mini"`
- Il worker non invia il proprio hostname (necessario alla TUI per determinare "local")

### 1.4 Configurazione Host Statica

| File | Linee | Ruolo |
|------|-------|-------|
| `src/lib/config.ts` | 269 | CRUD per `~/.config/csm/config.json` |
| `src/types.ts` | 115 | `HostConfig { host, defaultRepo?, projectsBase? }` |

**Funzioni interessate:** `getHosts()`, `addHost()`, `updateHost()`, `deleteHost()`, `renameHost()`, `getHost()`

### 1.5 SSH Utilities

| File | Linee | Ruolo |
|------|-------|-------|
| `src/lib/ssh.ts` | 514 | SSH: testConnection, getHostInfo, getLocalHostInfo, installHooks, execRemote |

**Nota:** `getHostInfo()` e `getLocalHostInfo()` raccolgono hostname, OS, uptime, RAM. Questa logica va riusata nel worker per essere inviata nell'heartbeat.

---

## 2. Piano Step-by-Step

### Fase 1: Worker Registration Protocol

**Obiettivo:** Il worker si registra al master con informazioni dettagliate sull'host, incluso l'hostname reale della macchina (necessario alla TUI per il matching "local").

#### Step 1.1: Estendere i tipi del worker

**File:** `src/worker/types.ts`

```typescript
// Nuovo tipo per worker registration
export type WorkerEventType =
  | "worker_registered"      // NUOVO
  | "worker_deregistered"    // NUOVO
  | "session_created"
  | "session_attached"
  | "session_detached"
  | "session_killed"
  | "claude_state_changed"
  | "git_changes"
  | "heartbeat";

// Info host inviata dal worker
export interface WorkerHostInfo {
  hostname: string;           // hostname reale della macchina (os.hostname())
  os: string;                 // "macOS 15.3", "Ubuntu 24.04"
  uptime: string;             // "5 days", "2h 30m"
  ramUsage: string;           // "12.4G/32.0G"
  arch: string;               // "arm64", "x86_64"
  cpuCount: number;
}

// Heartbeat data estesa
// data.hostInfo nel heartbeat e in worker_registered
```

**Punto critico:** `hostname` e' il campo che la TUI usa per determinare quale worker e' "local". Deve corrispondere a `os.hostname()` della macchina.

#### Step 1.2: Worker invia info host nell'heartbeat

**File:** `src/worker/worker-agent.ts`

- Nuovo metodo `gatherHostInfo(): Promise<WorkerHostInfo>` che riusa logica da `ssh.ts:getLocalHostInfo()`
- `sendHeartbeat()` include `hostInfo` nel payload
- Al `start()`, invia evento `worker_registered` con hostInfo completo
- Al `stop()`, invia evento `worker_deregistered`

#### Step 1.3: Master traccia worker con dettagli host

**File:** `src/api/server.ts`

Estendere `MasterState.workers`:
```typescript
workers: Map<string, {
  lastHeartbeat: string;
  sessionCount: number;
  hostInfo?: WorkerHostInfo;  // NUOVO — incluso hostname per matching TUI
  registeredAt: string;       // NUOVO
}>;
```

**Nota:** Il master **non** ha un campo `isLocal`. Il concetto di "local" non esiste lato server. E' determinato esclusivamente dalla TUI.

Gestire `worker_registered` e `worker_deregistered` in `handleWorkerEvent()`.

#### Step 1.4: Nuovo endpoint per lista worker

**File:** `src/api/server.ts`

Aggiungere: `GET /api/workers`

```json
{
  "workers": [
    {
      "id": "mac-mini",
      "status": "online",
      "lastHeartbeat": "2026-02-01T10:00:00Z",
      "registeredAt": "2026-02-01T09:00:00Z",
      "sessionCount": 3,
      "hostInfo": {
        "hostname": "Mac-Mini.local",
        "os": "macOS 15.3",
        "uptime": "5 days",
        "ramUsage": "12.4G/32.0G",
        "arch": "arm64",
        "cpuCount": 10
      }
    },
    {
      "id": "macbook-pro",
      "status": "online",
      "lastHeartbeat": "2026-02-01T10:00:05Z",
      "sessionCount": 1,
      "hostInfo": {
        "hostname": "MacBook-Pro.local",
        "os": "macOS 15.3",
        "uptime": "2 days",
        "ramUsage": "8.1G/16.0G",
        "arch": "arm64",
        "cpuCount": 12
      }
    }
  ]
}
```

**Nota:** La response **non contiene `isLocal`**. E' la TUI che confronta `os.hostname()` della macchina dove gira con `hostInfo.hostname` di ogni worker.

### Fase 2: Auto-Start Worker Co-Located nel Master

**Obiettivo:** `csm server` avvia automaticamente un worker sulla stessa macchina (co-located), non "locale" in senso TUI.

#### Step 2.1: Modificare il comando server

**File:** `src/commands/server.ts`

```typescript
export async function startServer(port?: number, options?: { noWorker?: boolean }): Promise<void> {
  const serverPort = port || parseInt(process.env.CSM_API_PORT || "3000", 10);
  const server = await startApiServer(serverPort);

  // Auto-start co-located worker (unless --no-worker)
  let colocatedWorker: WorkerAgent | null = null;
  if (!options?.noWorker) {
    colocatedWorker = await startColocatedWorker(serverPort);
  }

  // Graceful shutdown: stop worker first, then server
}
```

#### Step 2.2: Funzione startColocatedWorker

**File:** `src/commands/server.ts` (o nuovo `src/worker/colocated-worker.ts`)

```typescript
import { hostname } from "os";

async function startColocatedWorker(masterPort: number): Promise<WorkerAgent> {
  const config: WorkerConfig = {
    workerId: generateWorkerId(),            // da hostname, es. "mac-mini"
    masterUrl: `http://localhost:${masterPort}`,
    stateFile: join(homedir(), ".config/csm-worker/state.json"),
    pollInterval: 10000,
    heartbeatInterval: 30000,
  };

  const agent = new WorkerAgent(config);
  await agent.start();
  console.log(`[Master] Co-located worker started (ID: ${config.workerId})`);
  return agent;
}
```

**Nota:** Questo worker non e' intrinsecamente "local" — e' local solo quando la TUI gira sulla stessa macchina del master.

#### Step 2.3: Aggiungere flag CLI --no-worker

**File:** `src/index.ts`

Aggiungere parsing del flag `--no-worker` nel comando `server`.

### Fase 3: Worker ID Automatico

**Obiettivo:** Eliminare la necessita' di configurare manualmente `CSM_WORKER_ID`.

#### Step 3.1: Auto-generazione workerId

**File:** `src/commands/worker.ts`

```typescript
import { hostname } from "os";

function generateWorkerId(): string {
  // Usa hostname della macchina, sanitizzato
  const host = hostname().replace(/\.local$/, "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return host || "worker";
}
```

Fallback chain: `CSM_WORKER_ID` env > auto-generated da hostname.

**Nota:** Il workerId e' un identificatore logico (stabile). Il `hostInfo.hostname` e' il valore raw di `os.hostname()`, usato dalla TUI per il matching "local".

### Fase 4: Refactoring Tab Host (Frontend)

**Obiettivo:** Il tab "Host" mostra i worker registrati dal master, non host statici da config. Il concetto di "local" e' determinato **client-side** dalla TUI.

#### Step 4.1: Nuovo hook useWorkers

**File:** `src/tui/hooks/useWorkers.ts` (nuovo)

Sostituisce `useHosts.ts`:

```typescript
import { hostname } from "os";

export interface RegisteredWorker {
  id: string;
  status: "online" | "offline" | "stale";
  lastHeartbeat: string;
  registeredAt: string;
  sessionCount: number;
  hostInfo?: WorkerHostInfo;
}

// Tipo arricchito usato nella UI, con il flag isLocal calcolato client-side
export interface WorkerDisplayInfo extends RegisteredWorker {
  isLocal: boolean;  // true se hostInfo.hostname === os.hostname()
}

export function useWorkers(dispatch: React.Dispatch<AppAction>) {
  const localHostname = hostname();  // hostname della macchina dove gira la TUI

  // Poll GET /api/workers ogni 5s
  // Per ogni worker nella risposta:
  //   - Calcola isLocal: worker.hostInfo?.hostname === localHostname
  //   - Determina status: online se heartbeat < 60s, stale se < 120s, offline altrimenti
  // Ordina: local first, poi per nome
  // Dispatch SET_WORKERS con lista arricchita
}
```

**Punto chiave:** `isLocal` non viene dal server. E' calcolato dalla TUI confrontando `os.hostname()` con `worker.hostInfo.hostname`. Il matching e' case-insensitive e normalizzato (rimuove `.local` suffix per macOS).

```typescript
function isLocalWorker(workerHostname: string | undefined, tuiHostname: string): boolean {
  if (!workerHostname) return false;
  const normalize = (h: string) => h.replace(/\.local$/, "").toLowerCase();
  return normalize(workerHostname) === normalize(tuiHostname);
}
```

#### Step 4.2: Aggiornare AppState e AppAction

**File:** `src/tui/types.ts`

```typescript
export interface AppState {
  // ... esistenti ...
  workers: WorkerDisplayInfo[];       // NUOVO (sostituisce hosts + hostStatus)
  hosts: Record<string, HostConfig>;  // DEPRECATO ma mantenuto per backward compat
  hostStatus: Record<string, HostStatusInfo>;  // DEPRECATO
}

export type AppAction =
  // ... esistenti ...
  | { type: "SET_WORKERS"; workers: WorkerDisplayInfo[] }  // NUOVO
```

#### Step 4.3: Riscrivere Hosts.tsx

**File:** `src/tui/views/Hosts.tsx` -> refactor in-place (il tab resta "Hosts" nel menu)

**Cambiamenti UI:**
- Rinominare internamente ma mantenere il nome tab "Hosts" per l'utente
- Rimuovere modalita' create/edit/delete (i worker si auto-registrano)
- Il worker locale (dove gira la TUI) viene mostrato per primo con badge "(local)"
- Aggiungere visualizzazione sessioni per worker
- Mantenere `r` refresh
- Aggiungere `s` per forzare sync di un worker

**Layout nuovo (TUI aperta dal MacBook Pro):**

```
 ● macbook-pro (local)                Online
     macOS 15.3 · arm64 · 2 days uptime · RAM 8.1G/16.0G
     Sessions: 1 · Last heartbeat: 2s ago

 ● mac-mini                           Online
     macOS 15.3 · arm64 · 5 days uptime · RAM 12.4G/32.0G
     Sessions: 3 · Last heartbeat: 8s ago

 ○ linux-server                       Stale (45s)
     Ubuntu 24.04 · x86_64 · 120 days uptime · RAM 24.2G/64.0G
     Sessions: 0 · Last heartbeat: 45s ago
```

**Layout nuovo (stessa configurazione, TUI aperta dal Mac Mini):**

```
 ● mac-mini (local)                   Online
     macOS 15.3 · arm64 · 5 days uptime · RAM 12.4G/32.0G
     Sessions: 3 · Last heartbeat: 8s ago

 ● macbook-pro                        Online
     macOS 15.3 · arm64 · 2 days uptime · RAM 8.1G/16.0G
     Sessions: 1 · Last heartbeat: 2s ago

 ○ linux-server                       Stale (45s)
     Ubuntu 24.04 · x86_64 · 120 days uptime · RAM 24.2G/64.0G
     Sessions: 0 · Last heartbeat: 45s ago
```

**Keybindings nuovi:**
- `r` - Refresh (poll /api/workers)
- `Enter` - Espandi worker per vedere sessioni
- `Tab` - Switch tab

**Keybindings rimossi:**
- `c` create (non serve, i worker si auto-registrano)
- `e` edit (non serve)
- `d` delete (non serve, i worker offline scompaiono dopo timeout)
- `i` install hooks (spostato altrove o mantenuto come azione su worker remoto)

#### Step 4.4: Fallback quando nessun worker corrisponde alla macchina locale

Se la TUI gira su una macchina che non ha un worker registrato (es. la TUI gira su un laptop che non ha `csm worker start`), nessun worker sara' marcato come "(local)". Questo e' corretto: la TUI mostra solo i worker registrati al master, e la macchina corrente potrebbe non essere tra essi.

Opzionalmente, mostrare un banner:

```
  ⚠ No worker running on this machine. Run `csm worker start` to register.
```

### Fase 5: Deprecazione Configurazione Statica Host

**Obiettivo:** Rimuovere gradualmente la dipendenza da `config.hosts`.

#### Step 5.1: Separare host da config

La sezione `hosts` in `config.json` viene deprecata. Non viene rimossa immediatamente per backward compatibility, ma:
- Il tab Host non la legge piu'
- Le funzioni `addHost()`, `updateHost()`, `deleteHost()` vengono marcate come deprecated
- I comandi `csm create --host <name>` continuano a funzionare leggendo dalla config legacy

#### Step 5.2: Aggiungere worker-aware session creation

Per creare sessioni su un worker remoto, serve un nuovo meccanismo:
- Aggiungere `POST /api/workers/:workerId/create-session` al master
- Il master inoltra la richiesta al worker (richiede comunicazione bidirezionale, vedi Fase 6)

**Nota:** Questa fase e' la piu' complessa e puo' essere posticipata. Per ora, la creazione di sessioni remote puo' continuare a usare SSH diretto.

### Fase 6: (Futura) Comunicazione Bidirezionale

**Non in scope per questo refactoring**, ma da considerare:

Attualmente la comunicazione e' solo `Worker -> Master` (push). Per supportare operazioni come "crea sessione su worker remoto" serve:
- **Opzione A**: Il master invia comandi al worker via HTTP (il worker espone un API)
- **Opzione B**: WebSocket bidirezionale
- **Opzione C**: Long-polling dal worker verso il master per ricevere comandi

---

## 3. Riepilogo Modifiche per File

### File da Creare

| File | Descrizione |
|------|-------------|
| `src/tui/hooks/useWorkers.ts` | Hook per polling lista worker dal master API + logica isLocal client-side |

### File da Modificare

| File | Modifiche |
|------|-----------|
| `src/worker/types.ts` | Aggiungere `worker_registered`, `worker_deregistered`, `WorkerHostInfo` (con hostname) |
| `src/worker/worker-agent.ts` | `gatherHostInfo()`, invio hostInfo in heartbeat, eventi register/deregister |
| `src/api/server.ts` | Estendere MasterState (senza isLocal), gestire nuovi eventi, `GET /api/workers` |
| `src/commands/server.ts` | Auto-start worker co-located, flag `--no-worker` |
| `src/commands/worker.ts` | Auto-generazione workerId da hostname |
| `src/index.ts` | Parsing flag `--no-worker` |
| `src/tui/views/Hosts.tsx` | Riscrittura completa: da host statici a worker dinamici, isLocal da hostname match |
| `src/tui/hooks/useHosts.ts` | Deprecare (sostituito da useWorkers) |
| `src/tui/types.ts` | Aggiungere `workers: WorkerDisplayInfo[]`, action `SET_WORKERS` |
| `src/tui/App.tsx` | Passare `useWorkers` al tab Hosts invece di `useHosts` |

### File da Deprecare (non eliminare subito)

| File | Note |
|------|------|
| `src/tui/hooks/useHosts.ts` | Sostituito da `useWorkers.ts`, mantenere per backward compat |
| `src/lib/config.ts` (sezione hosts) | Le funzioni host CRUD restano ma deprecate |

---

## 4. Migration Path

### Fase 1 - Backward Compatible (questo PR)

1. Aggiungere registrazione worker con hostInfo (incluso hostname per matching TUI)
2. Auto-start worker co-located nel master server
3. Aggiungere `GET /api/workers` endpoint (senza isLocal — e' client-side)
4. Riscrivere tab Host per leggere da `/api/workers` con matching isLocal da `os.hostname()`
5. Il tab Host mostra "No master server running" se il master non e' raggiungibile
6. Se nessun worker matcha l'hostname locale, mostra banner "No worker on this machine"
7. **config.hosts resta funzionante** per `csm create --host`

### Fase 2 - Deprecation Notice

1. Se `config.hosts` contiene entry, mostrare warning al boot: "Static host configuration is deprecated. Use `csm worker start` on remote machines."
2. Aggiungere docs per migrazione

### Fase 3 - Rimozione (futuro PR)

1. Rimuovere `config.hosts` dal config schema
2. Rimuovere `addHost()`, `updateHost()`, `deleteHost()`, `renameHost()` da `lib/config.ts`
3. Rimuovere `useHosts.ts`
4. Riscrivere `csm create --host` per usare il worker API

---

## 5. Testing Plan

### Unit Tests

| Test | File Target | Descrizione |
|------|-------------|-------------|
| Worker registration event | `worker-agent.ts` | Verifica invio `worker_registered` al start con hostInfo.hostname |
| Worker deregistration event | `worker-agent.ts` | Verifica invio `worker_deregistered` al stop |
| Host info gathering | `worker-agent.ts` | Verifica `gatherHostInfo()` ritorna hostname da `os.hostname()` |
| Heartbeat con hostInfo | `worker-agent.ts` | Verifica che heartbeat includa hostInfo.hostname |
| Master handles registration | `server.ts` | Verifica che il master aggiorna workers map (senza isLocal) |
| GET /api/workers | `server.ts` | Verifica risposta con lista worker, hostInfo.hostname, niente isLocal |
| **isLocal matching** | `useWorkers.ts` | **Verifica che isLocal e' true solo quando worker.hostInfo.hostname matcha os.hostname() della TUI** |
| isLocal normalization | `useWorkers.ts` | Verifica matching case-insensitive e senza `.local` suffix |
| No local worker | `useWorkers.ts` | Verifica comportamento quando nessun worker matcha (isLocal false per tutti) |
| Auto workerId generation | `worker.ts` | Verifica generazione ID da hostname |

### Integration Tests

| Test | Descrizione |
|------|-------------|
| Co-located worker auto-start | `csm server` avvia e il worker co-located si registra con hostname reale |
| `--no-worker` flag | `csm server --no-worker` non avvia worker co-located |
| Remote worker flow | Worker remoto si registra, invia heartbeat con hostname, master lo traccia |
| Worker offline detection | Dopo timeout heartbeat, worker appare come offline |
| Worker reconnection | Worker si riconnette dopo interruzione, processa event queue |
| **TUI local detection** | **TUI marca come "(local)" solo il worker il cui hostname matcha la macchina TUI** |
| TUI no local worker | TUI mostra banner quando nessun worker matcha |

### Manual Testing Checklist

- [ ] `csm server` su Mac Mini — avvia master + worker co-located
- [ ] `csm server --no-worker` — avvia solo master
- [ ] `csm worker start` su MacBook Pro con `CSM_MASTER_URL` configurato
- [ ] **TUI su MacBook Pro**: mostra MacBook Pro come "(local)", Mac Mini come remoto
- [ ] **TUI su Mac Mini**: mostra Mac Mini come "(local)", MacBook Pro come remoto
- [ ] **TUI su terza macchina** (senza worker): nessun worker e' "(local)", banner mostrato
- [ ] Worker remoto va offline -> tab Host mostra "offline" dopo ~60s
- [ ] Worker remoto torna online -> tab Host mostra "online"
- [ ] Sessioni create su qualsiasi worker appaiono nel master
- [ ] Graceful shutdown: `csm server` stoppa worker co-located prima del server
- [ ] Config legacy `hosts` non causa errori (backward compat)

---

## 6. Rischi e Mitigazioni

| Rischio | Mitigazione |
|---------|-------------|
| Hostname mismatch (TUI non trova worker local) | Normalizzazione aggressiva: lowercase, rimuovi `.local`, trim. Fallback a banner informativo |
| Hostname duplicati (due macchine con stesso hostname) | Il workerId e' l'identificatore univoco; il match hostname e' best-effort per UX |
| Master non raggiungibile dalla TUI | Il tab Host mostra messaggio chiaro; fornire URL master configurabile |
| Worker co-located fallisce | Il master continua a funzionare; il tab mostra il worker come offline |
| Migrazione rompe workflow esistenti | config.hosts resta funzionante nella Fase 1; deprecation graduale |
| Latenza polling 5s per tab Host | Accettabile per UX; puo' essere ridotto se necessario |
| Race condition worker co-located al boot | Il worker si registra dopo il server; retry loop su primo heartbeat |
| Memory leak eventi | Aggiungere limit alla coda eventi (max 1000, FIFO eviction) |

---

## 7. Ordine di Implementazione Consigliato

1. **`src/worker/types.ts`** - Nuovi tipi (WorkerHostInfo con hostname, nuovi eventi)
2. **`src/worker/worker-agent.ts`** - gatherHostInfo (con os.hostname()), register/deregister, heartbeat esteso
3. **`src/api/server.ts`** - Gestione nuovi eventi, MasterState esteso (senza isLocal), `GET /api/workers`
4. **`src/commands/worker.ts`** - Auto workerId da hostname
5. **`src/commands/server.ts`** + **`src/index.ts`** - Auto-start worker co-located, `--no-worker`
6. **`src/tui/types.ts`** - Nuovi tipi stato e azioni (WorkerDisplayInfo con isLocal)
7. **`src/tui/hooks/useWorkers.ts`** - Nuovo hook con logica isLocal = hostname match client-side
8. **`src/tui/views/Hosts.tsx`** - Riscrittura UI con ordinamento local-first
9. **`src/tui/App.tsx`** - Integrazione nuovo hook
10. **Tests** - Unit e integration, con focus su isLocal matching
