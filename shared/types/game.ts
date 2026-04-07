export enum Influences {
  Assassin = 'Assassin',
  Contessa = 'Contessa',
  Captain = 'Captain',
  Ambassador = 'Ambassador',
  Inquisitor = 'Inquisitor',
  Duke = 'Duke',
}

export enum Actions {
  Assassinate = 'Assassinate',
  Steal = 'Steal',
  Coup = 'Coup',
  Tax = 'Tax',
  ForeignAid = 'Foreign Aid',
  Income = 'Income',
  Exchange = 'Exchange',
  Revive = 'Revive',
  Convert = 'Convert',
  Embezzle = 'Embezzle',
  Examine = 'Examine',
}

export enum PlayerActions {
  gameState = 'gameState',
  createGame = 'createGame',
  joinGame = 'joinGame',
  addAiPlayer = 'addAiPlayer',
  removeFromGame = 'removeFromGame',
  startGame = 'startGame',
  setGameSettings = 'setGameSettings',
  setPlayerController = 'setPlayerController',
  resetGame = 'resetGame',
  resetGameRequest = 'resetGameRequest',
  resetGameRequestCancel = 'resetGameRequestCancel',
  forfeit = 'forfeit',
  checkAutoMove = 'checkAutoMove',
  action = 'action',
  actionResponse = 'actionResponse',
  actionChallengeResponse = 'actionChallengeResponse',
  blockResponse = 'blockResponse',
  blockChallengeResponse = 'blockChallengeResponse',
  loseInfluences = 'loseInfluences',
  chooseStartingAllegiance = 'chooseStartingAllegiance',
  chooseExamineInfluence = 'chooseExamineInfluence',
  resolveExamine = 'resolveExamine',
  embezzleChallengeDecision = 'embezzleChallengeDecision',
  sendChatMessage = 'sendChatMessage',
  setChatMessageDeleted = 'setChatMessageDeleted',
  setEmojiOnChatMessage = 'setEmojiOnChatMessage',
}

export enum ServerEvents {
  gameStateChanged = 'gameStateChanged',
  error = 'error',
}

export enum Allegiances {
  Loyalist = 'Loyalist',
  Reformist = 'Reformist',
}

export enum ExamineResponses {
  Return = 'Return',
  ForceExchange = 'ForceExchange',
}

export enum EmbezzleChallengeResponses {
  Concede = 'Concede',
  ProveNoDuke = 'ProveNoDuke',
}

export const InfluenceAttributes: {
  [influence in Influences]: {
    legalAction?: Actions;
    legalBlock?: Actions;
  };
} = {
  [Influences.Assassin]: {
    legalAction: Actions.Assassinate,
  },
  [Influences.Contessa]: {
    legalBlock: Actions.Assassinate,
  },
  [Influences.Captain]: {
    legalAction: Actions.Steal,
    legalBlock: Actions.Steal,
  },
  [Influences.Ambassador]: {
    legalAction: Actions.Exchange,
    legalBlock: Actions.Steal,
  },
  [Influences.Inquisitor]: {
    legalAction: Actions.Exchange,
    legalBlock: Actions.Steal,
  },
  [Influences.Duke]: {
    legalAction: Actions.Tax,
    legalBlock: Actions.ForeignAid,
  },
};

export const ActionAttributes: {
  [action in Actions]: {
    blockable: boolean;
    challengeable: boolean;
    coinsRequired?: number;
    influenceRequired?: Influences;
    requiresTarget: boolean;
    targetMode: 'none' | 'required' | 'optional';
  };
} = {
  [Actions.Assassinate]: {
    blockable: true,
    challengeable: true,
    coinsRequired: 3,
    influenceRequired: Influences.Assassin,
    requiresTarget: true,
    targetMode: 'required',
  },
  [Actions.Steal]: {
    blockable: true,
    challengeable: true,
    influenceRequired: Influences.Captain,
    requiresTarget: true,
    targetMode: 'required',
  },
  [Actions.Coup]: {
    blockable: false,
    challengeable: false,
    coinsRequired: 7,
    requiresTarget: true,
    targetMode: 'required',
  },
  [Actions.Tax]: {
    blockable: false,
    challengeable: true,
    influenceRequired: Influences.Duke,
    requiresTarget: false,
    targetMode: 'none',
  },
  [Actions.ForeignAid]: {
    blockable: true,
    challengeable: false,
    requiresTarget: false,
    targetMode: 'none',
  },
  [Actions.Income]: {
    blockable: false,
    challengeable: false,
    requiresTarget: false,
    targetMode: 'none',
  },
  [Actions.Exchange]: {
    blockable: false,
    challengeable: true,
    influenceRequired: Influences.Ambassador,
    requiresTarget: false,
    targetMode: 'none',
  },
  [Actions.Revive]: {
    blockable: false,
    challengeable: false,
    coinsRequired: 10,
    requiresTarget: false,
    targetMode: 'none',
  },
  [Actions.Convert]: {
    blockable: false,
    challengeable: false,
    coinsRequired: 1,
    requiresTarget: false,
    targetMode: 'optional',
  },
  [Actions.Embezzle]: {
    blockable: false,
    challengeable: true,
    requiresTarget: false,
    targetMode: 'none',
  },
  [Actions.Examine]: {
    blockable: true,
    challengeable: true,
    influenceRequired: Influences.Inquisitor,
    requiresTarget: true,
    targetMode: 'required',
  },
};

export enum Responses {
  Pass = 'Pass',
  Challenge = 'Challenge',
  Block = 'Block',
}

export enum PlayerControllers {
  Bot = 'bot',
  Human = 'human',
}

export enum EventMessages {
  ActionConfirm = 'ActionConfirm',
  ActionPending = 'ActionPending',
  ActionProcessed = 'ActionProcessed',
  ExamineReturned = 'ExamineReturned',
  ExamineForcedExchange = 'ExamineForcedExchange',
  ForcedMoveProcessed = 'ForcedMoveProcessed',
  BlockPending = 'BlockPending',
  BlockSuccessful = 'BlockSuccessful',
  BlockFailed = 'BlockFailed',
  ChallengePending = 'ChallengePending',
  ChallengeSuccessful = 'ChallengeSuccessful',
  ChallengeFailed = 'ChallengeFailed',
  GameStarted = 'GameStarted',
  PlayerDied = 'PlayerDied',
  PlayerForfeited = 'PlayerForfeited',
  PlayerLostInfluence = 'PlayerLostInfluence',
  PlayerReplacedInfluence = 'PlayerReplacedInfluence',
  PlayerReplacedWithAi = 'PlayerReplacedWithAi',
  PlayerControllerSetToBot = 'PlayerControllerSetToBot',
  PlayerControllerAssignedToHuman = 'PlayerControllerAssignedToHuman',
}

export type EventMessage = {
  event: EventMessages;
  action?: Actions;
  primaryPlayer?: string;
  secondaryPlayer?: string;
  influence?: Influences;
  turn: number;
};

export type AiPersonality = {
  vengefulness: number;
  honesty: number;
  skepticism: number;
};

export type Player = {
  coins: number;
  color: string;
  id: string;
  influences: Influences[];
  claimedInfluences: Set<Influences>;
  unclaimedInfluences: Set<Influences>;
  deadInfluences: Influences[];
  name: string;
  allegiance?: Allegiances;
  ai: boolean;
  personalityHidden?: boolean;
  personality?: AiPersonality;
  grudges: {
    [playerName: string]: number;
  };
  uid?: string;
  photoURL?: string;
};

export type DehydratedPlayer = Omit<
  Player,
  'claimedInfluences' | 'unclaimedInfluences'
> & {
  claimedInfluences: Influences[];
  unclaimedInfluences: Influences[];
};

export type PublicPlayer = Omit<
  Player,
  'id' | 'influences' | 'personalityHidden'
> & {
  influenceCount: number;
  influences?: Influences[];
};

export type DehydratedPublicPlayer = Omit<
  PublicPlayer,
  'claimedInfluences' | 'unclaimedInfluences'
> & {
  claimedInfluences: Influences[];
  unclaimedInfluences: Influences[];
};

export type Spectator = {
  id: string;
  name: string;
  uid?: string;
  photoURL?: string;
};

export type GameSettings = {
  eventLogRetentionTurns: number;
  allowRevive: boolean;
  aiMoveDelayMs?: number;
  speedRoundSeconds?: number;
  enableReformation?: boolean;
  enableInquisitor?: boolean;
  allowContessaBlockExamine?: boolean;
};

export type ChatMessage = {
  id: string;
  from: string;
  timestamp: Date;
  text: string;
  deleted: boolean;
  emojis?: {
    [emoji: string]: Set<string>;
  };
};

export type DehydratedChatMessage = Omit<
  ChatMessage,
  'timestamp' | 'emojis'
> & {
  timestamp: string;
  emojis?: {
    [emoji: string]: string[];
  };
};

type PendingAction = {
  targetPlayer?: string;
  action: Actions;
  pendingPlayers: Set<string>;
  claimConfirmed: boolean;
};

type DehydratedPendingAction = Omit<PendingAction, 'pendingPlayers'> & {
  pendingPlayers: string[];
};

type PendingBlock = {
  sourcePlayer: string;
  claimedInfluence: Influences;
  pendingPlayers: Set<string>;
};

type DehydratedPendingBlock = Omit<PendingBlock, 'pendingPlayers'> & {
  pendingPlayers: string[];
};

export type PendingStartingAllegiance = {
  sourcePlayer: string;
};

export type PendingExamine = {
  sourcePlayer: string;
  targetPlayer: string;
  chosenInfluence?: Influences;
};

export type PendingEmbezzleChallengeDecision = {
  sourcePlayer: string;
  challengePlayer: string;
};

export type GameState = {
  deck: Influences[];
  eventLogs: EventMessage[];
  chatMessages: ChatMessage[];
  lastEventTimestamp: Date;
  creatorPlayerId?: string;
  isStarted: boolean;
  availablePlayerColors: string[];
  players: Player[];
  pendingAction?: PendingAction;
  pendingActionChallenge?: {
    sourcePlayer: string;
  };
  pendingBlock?: PendingBlock;
  pendingBlockChallenge?: {
    sourcePlayer: string;
  };
  pendingInfluenceLoss: {
    [player: string]: {
      putBackInDeck: boolean;
    }[];
  };
  pendingStartingAllegiance?: PendingStartingAllegiance;
  pendingExamine?: PendingExamine;
  pendingEmbezzleChallengeDecision?: PendingEmbezzleChallengeDecision;
  treasuryReserveCoins: number;
  roomId: string;
  turnPlayer?: string;
  turn: number;
  resetGameRequest?: {
    player: string;
  };
  settings: GameSettings;
  gameId?: string;
  gameActionStats?: import('./user').GameActionStats;
};

export type DehydratedGameState = Omit<
  GameState,
  | 'players'
  | 'lastEventTimestamp'
  | 'chatMessages'
  | 'pendingAction'
  | 'pendingBlock'
> & {
  players: DehydratedPlayer[];
  lastEventTimestamp: string;
  chatMessages: DehydratedChatMessage[];
  pendingAction?: DehydratedPendingAction;
  pendingBlock?: DehydratedPendingBlock;
};

export type PublicGameState = Pick<
  GameState,
  | 'eventLogs'
  | 'chatMessages'
  | 'isStarted'
  | 'lastEventTimestamp'
  | 'pendingInfluenceLoss'
  | 'roomId'
  | 'turn'
  | 'settings'
  | 'pendingStartingAllegiance'
  | 'pendingExamine'
  | 'pendingEmbezzleChallengeDecision'
  | 'treasuryReserveCoins'
> &
  Partial<
    Pick<
      GameState,
      | 'pendingAction'
      | 'pendingActionChallenge'
      | 'pendingBlock'
      | 'pendingBlockChallenge'
      | 'resetGameRequest'
      | 'turnPlayer'
    >
  > & {
    players: PublicPlayer[];
    selfPlayer?: Player;
    deckCount: number;
    selfIsCreator: boolean;
    creatorPlayerName?: string;
    creatorDisplayName?: string;
    spectators?: Spectator[];
  };

export type DehydratedPublicGameState = Omit<
  PublicGameState,
  | 'players'
  | 'selfPlayer'
  | 'lastEventTimestamp'
  | 'chatMessages'
  | 'pendingAction'
  | 'pendingBlock'
> & {
  players: DehydratedPublicPlayer[];
  selfPlayer?: DehydratedPlayer;
  lastEventTimestamp: string;
  chatMessages: DehydratedChatMessage[];
  pendingAction?: DehydratedPendingAction;
  pendingBlock?: DehydratedPendingBlock;
};
