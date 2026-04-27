# Local Dev Setup — Debugging & Testing

Use this guide to run Spectra against a real Entra ID dev tenant and SharePoint Embedded container. Covers everything from app registration through first workspace creation.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Dev tenant | Global Admin access needed for steps 1–4 |
| Azure subscription | Can be the same tenant; needed for Key Vault |
| `az` CLI | `az login` before running any `az` commands |
| `npm` / Node 20 | `node --version` must show `v20.x` or later |
| `openssl` | Used to generate random secret keys |

---

## Step 1 — Register the Entra ID App

**portal.azure.com → Entra ID → App registrations → New registration**

| Field | Value |
|---|---|
| Name | `spectra-dev` |
| Supported account types | Single tenant |
| Redirect URI (Web) | `http://localhost:3000/api/auth/callback` |

After creating, note:
- **Application (client) ID** → used as `AZURE_CLIENT_ID`
- **Directory (tenant) ID** → used as `AZURE_TENANT_ID`

Create a client secret: **Certificates & secrets → New client secret** → note the **Value** (shown once only).

---

## Step 2 — Add API Permissions

**App registration → API permissions → Add a permission → Microsoft Graph → Delegated:**

- `Files.ReadWrite.All`
- `User.ReadBasic.All`
- `offline_access`

Then click **Grant admin consent for \<tenant\>**.

---

## Step 3 — Add the `AppAdmin` App Role

**App registration → App roles → Create app role:**

| Field | Value |
|---|---|
| Display name | `Spectra Admin` |
| Allowed member types | Users/Groups |
| Value | `AppAdmin` |
| Description | Full admin access to Spectra |

Assign yourself:  
**Enterprise Applications → spectra-dev → Users and groups → Add user/group → select your account → select role `Spectra Admin`.**

> Without this role assignment, your account will be a regular member (no admin tabs).

---

## Step 4 — Register SPE Container Type

Install the M365 CLI if needed:

```bash
npm i -g @pnp/cli-microsoft365
m365 login
```

Register a trial Container Type (free for dev tenants):

```bash
m365 spe containertype add \
  --name "SpectraDev" \
  --applicationId <AZURE_CLIENT_ID>
```

Note the returned **containerTypeId** → used as `AZURE_CONTAINER_TYPE_ID`.

Consent the Container Type onto your tenant:

```bash
m365 spe containertype register --id <AZURE_CONTAINER_TYPE_ID>
```

Note your SharePoint hostname (e.g. `contoso.sharepoint.com`) → used as `SHAREPOINT_HOSTNAME`.

---

## Step 5 — Create the System Container

Get a Graph access token and create one container instance:

```bash
TOKEN=$(m365 util accesstoken get --resource "https://graph.microsoft.com" --new)

curl -s -X POST "https://graph.microsoft.com/v1.0/storage/fileStorage/containers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"displayName\": \"Spectra System\",
    \"containerTypeId\": \"<AZURE_CONTAINER_TYPE_ID>\"
  }" | jq '.id'
```

Note the returned `id` → used as `AZURE_SYSTEM_CONTAINER_ID`.

---

## Step 6 — Create Key Vault and Store Secrets

The BFF loads three secrets at startup from Key Vault. `DefaultAzureCredential` picks up your `az login` session automatically.

```bash
RESOURCE_GROUP=spectra-dev
KV_NAME=spectra-dev-kv   # must be globally unique across Azure

az group create -n $RESOURCE_GROUP -l eastus

az keyvault create \
  -n $KV_NAME \
  -g $RESOURCE_GROUP \
  --enable-rbac-authorization false

# Grant your account access
az keyvault set-policy -n $KV_NAME \
  --upn <your-entra-email> \
  --secret-permissions get set list

# Store the three required secrets
az keyvault secret set -n aad-client-secret \
  --vault-name $KV_NAME \
  --value "<client-secret-from-step-1>"

az keyvault secret set -n cookie-hmac-key \
  --vault-name $KV_NAME \
  --value "$(openssl rand -hex 32)"

az keyvault secret set -n session-encryption-key \
  --vault-name $KV_NAME \
  --value "$(openssl rand -hex 32)"
```

Key Vault URI format: `https://<KV_NAME>.vault.azure.net/` → used as `AZURE_KEY_VAULT_URI`.

---

## Step 7 — Create `.env.local`

Create this file in the **repo root** (it is gitignored — never commit it):

```bash
# .env.local — local dev only, do not commit
AZURE_TENANT_ID=<directory-tenant-id>
AZURE_CLIENT_ID=<application-client-id>
AZURE_CONTAINER_TYPE_ID=<container-type-id>
AZURE_SYSTEM_CONTAINER_ID=<system-container-id>
AZURE_KEY_VAULT_URI=https://<kv-name>.vault.azure.net/
SHAREPOINT_HOSTNAME=<tenant>.sharepoint.com
APP_BASE_URL=http://localhost:3000

# Required by schema — use dummy value locally (telemetry won't send)
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=00000000-0000-0000-0000-000000000000

SESSION_TTL_SLIDING_MIN=480
SESSION_TTL_ABSOLUTE_MIN=1440
LOG_LEVEL=debug
NODE_ENV=development
PORT=3000
```

---

## Step 8 — Start the Dev Server

```bash
cd <repo-root>
npm install
npm run dev
```

- BFF starts on `:3000`
- Vite dev server starts on `:5173` (proxied to BFF)

Open `http://localhost:5173` → you are redirected to Microsoft login → sign in with your dev tenant account.

---

## Step 9 — Create Your First Workspace

After signing in as the admin user:

1. Go to `http://localhost:5173/w/ap-invoices/admin/workspaces`
2. Click **Create** → set ID to `ap-invoices`, template `Invoices`
3. Return to `http://localhost:5173/w` — the **AP Invoices** workspace tile should appear

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| BFF crashes at startup with `Invalid environment configuration` | Missing or malformed env var | Check all vars in `.env.local` match the types in `.env.example` |
| BFF crashes with `Key Vault secret ... is missing` | Secret not stored in KV, or wrong KV URI | Re-run the `az keyvault secret set` commands; verify `AZURE_KEY_VAULT_URI` |
| Login redirects then returns `401` | Client secret mismatch | Regenerate client secret in portal, update `aad-client-secret` in KV |
| Login succeeds but no Admin tab | `AppAdmin` role not assigned | Re-check Enterprise Applications → Users and groups assignment |
| Workspace created but file upload fails | Container Type not consented or wrong `AZURE_SYSTEM_CONTAINER_ID` | Re-run `m365 spe containertype register` and verify container ID |
| `DefaultAzureCredential` fails to get KV token | Not logged in via `az` CLI | Run `az login` and retry |

---

## Resetting Secrets (Rotation)

```bash
az keyvault secret set -n cookie-hmac-key \
  --vault-name $KV_NAME \
  --value "$(openssl rand -hex 32)"

az keyvault secret set -n session-encryption-key \
  --vault-name $KV_NAME \
  --value "$(openssl rand -hex 32)"
```

Restart the BFF after rotation. Existing sessions are invalidated (users must re-login).
