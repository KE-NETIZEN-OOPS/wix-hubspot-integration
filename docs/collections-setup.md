# Wix Data Collections Setup

Create these 4 collections in Wix Dashboard → Content Manager → + New Collection.

---

## 1. ContactIdMap

| Field ID | Display Name | Type |
|---|---|---|
| wixContactId | Wix Contact ID | Text |
| hubspotContactId | HubSpot Contact ID | Text |
| lastSyncedAt | Last Synced At | Date and Time |
| lastSyncSource | Last Sync Source | Text |

**Indexes:** Add index on `wixContactId`, add index on `hubspotContactId`
**Permissions:** default (read/write by admin)

---

## 2. FieldMappings

| Field ID | Display Name | Type |
|---|---|---|
| wixField | Wix Field | Text |
| hubspotProperty | HubSpot Property | Text |
| direction | Direction | Text |
| transform | Transform | Text |

**Permissions:** Set Read + Write to "Admin only"

---

## 3. SyncQueue

| Field ID | Display Name | Type |
|---|---|---|
| syncId | Sync ID | Text |
| source | Source | Text |
| eventType | Event Type | Text |
| contactId | Contact ID | Text |
| payload | Payload | Text |
| status | Status | Text |
| retryCount | Retry Count | Number |
| error | Error | Text |

**Indexes:** Add index on `syncId`, add index on `status`
**Permissions:** default

---

## 4. SyncLog

| Field ID | Display Name | Type |
|---|---|---|
| syncId | Sync ID | Text |
| source | Source | Text |
| wixContactId | Wix Contact ID | Text |
| hubspotContactId | HubSpot Contact ID | Text |

**Indexes:** Add index on `syncId`
**Permissions:** Set Read + Write to "Admin only"
