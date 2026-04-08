import crypto from 'node:crypto'
import { Spectator } from '../../../shared/types/game'

const ROOM_PRESENCE_TTL_MS = 15_000

type RoomViewerPresence = {
  viewerId: string
  spectatorId: string
  name?: string
  uid?: string
  photoURL?: string
  lastSeen: number
}

const roomPresence = new Map<string, Map<string, RoomViewerPresence>>()

const cleanupRoomPresence = (roomId: string) => {
  const roomViewers = roomPresence.get(roomId)
  if (!roomViewers) {
    return
  }

  const now = Date.now()
  roomViewers.forEach((presence, viewerId) => {
    if (presence.lastSeen + ROOM_PRESENCE_TTL_MS < now) {
      roomViewers.delete(viewerId)
    }
  })

  if (!roomViewers.size) {
    roomPresence.delete(roomId)
  }
}

const getRoomViewers = (roomId: string) => {
  cleanupRoomPresence(roomId)
  let roomViewers = roomPresence.get(roomId)
  if (!roomViewers) {
    roomViewers = new Map<string, RoomViewerPresence>()
    roomPresence.set(roomId, roomViewers)
  }
  return roomViewers
}

export const upsertRoomPresence = ({
  roomId,
  playerId,
  name,
  uid,
  photoURL
}: {
  roomId: string
  playerId: string
  name?: string
  uid?: string
  photoURL?: string
}) => {
  const roomViewers = getRoomViewers(roomId)
  const existingPresence = roomViewers.get(playerId)
  const updatedPresence: RoomViewerPresence = {
    viewerId: playerId,
    spectatorId: existingPresence?.spectatorId ?? crypto.randomUUID(),
    lastSeen: Date.now(),
  }
  const effectiveName = name ?? existingPresence?.name
  const effectiveUid = uid ?? existingPresence?.uid
  const effectivePhotoURL = photoURL ?? existingPresence?.photoURL

  if (effectiveName) {
    updatedPresence.name = effectiveName
  }
  if (effectiveUid) {
    updatedPresence.uid = effectiveUid
  }
  if (effectivePhotoURL) {
    updatedPresence.photoURL = effectivePhotoURL
  }

  roomViewers.set(playerId, updatedPresence)
}

export const getRoomPresence = ({
  roomId,
  playerId
}: {
  roomId: string
  playerId: string
}) => {
  cleanupRoomPresence(roomId)
  return roomPresence.get(roomId)?.get(playerId)
}

export const getPublicSpectatorsForRoom = ({
  roomId,
  currentPlayerIds,
  moderatorViewerIds,
}: {
  roomId: string
  currentPlayerIds: Set<string>
  moderatorViewerIds?: Set<string>
}): Spectator[] => {
  cleanupRoomPresence(roomId)
  return [...(roomPresence.get(roomId)?.values() ?? [])]
    .filter(({ viewerId, name }) => !currentPlayerIds.has(viewerId) && !!name)
    .sort((a, b) => a.name!.localeCompare(b.name!))
    .map(({ viewerId, spectatorId, name, uid, photoURL }) => ({
      id: spectatorId,
      name: name!,
      isModerator: moderatorViewerIds?.has(viewerId) ?? false,
      ...(uid && { uid }),
      ...(photoURL && { photoURL }),
    }))
}

export const getConnectedViewerIdsForRoom = (roomId: string) => {
  cleanupRoomPresence(roomId)
  return new Set([...(roomPresence.get(roomId)?.keys() ?? [])])
}

export const getViewerIdForSpectator = ({
  roomId,
  spectatorId,
  currentPlayerIds
}: {
  roomId: string
  spectatorId: string
  currentPlayerIds: Set<string>
}) => {
  cleanupRoomPresence(roomId)
  const roomViewers = roomPresence.get(roomId)
  if (!roomViewers) {
    return undefined
  }

  for (const presence of roomViewers.values()) {
    if (presence.spectatorId === spectatorId && !currentPlayerIds.has(presence.viewerId)) {
      return presence
    }
  }

  return undefined
}

export const clearRoomPresence = () => {
  roomPresence.clear()
}

export const removeRoomPresence = ({
  roomId,
  playerId
}: {
  roomId: string
  playerId: string
}) => {
  const roomViewers = roomPresence.get(roomId)
  roomViewers?.delete(playerId)
  if (roomViewers && !roomViewers.size) {
    roomPresence.delete(roomId)
  }
}
