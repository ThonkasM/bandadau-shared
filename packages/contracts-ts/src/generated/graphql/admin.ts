/* eslint-disable */
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** Fecha ISO-8601 sin hora, p. ej. `2026-10-14`. */
  Date: { input: string; output: string; }
  /** Fecha y hora ISO-8601 en UTC, p. ej. `2026-10-14T15:04:05Z`. */
  DateTime: { input: string; output: string; }
  /** Valor JSON arbitrario (datasets, especificaciones Vega-Lite, detalles de alertas). */
  JSON: { input: unknown; output: unknown; }
  /** Entero de 64 bits serializado como número JSON (créditos y contadores). */
  Long: { input: number; output: number; }
  /** Identificador UUID (v7 generado por la aplicación). */
  UUID: { input: string; output: string; }
};

export type AcknowledgeAlertPayload = {
  alert: Maybe<Alert>;
  errors: Array<UserError>;
};

/** Agente que ejecutó una corrida. */
export type AgentKind =
  /** Sesión de un cliente MCP externo autenticado con token MCP. */
  | 'EXTERNAL_MCP'
  | 'MONITORING'
  | 'REPORT';

/** Ejecución de un agente (MonitoringAgent o ReportAgent). */
export type AgentRun = {
  agent: AgentKind;
  alerts: Array<Alert>;
  error: Maybe<Scalars['String']['output']>;
  finishedAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['UUID']['output'];
  model: Maybe<Scalars['String']['output']>;
  report: Maybe<GeneratedReport>;
  startedAt: Scalars['DateTime']['output'];
  status: AgentRunStatus;
  steps: Array<AgentRunStep>;
  /** Por qué terminó (p. ej. COMPLETED, MAX_STEPS, MAX_TOKENS, ERROR). */
  stopReason: Maybe<Scalars['String']['output']>;
  tokens: Maybe<TokenUsage>;
  toolsUsed: Array<Scalars['String']['output']>;
  /** SCHEDULE, MANUAL o REPORT_REQUEST. */
  trigger: Scalars['String']['output'];
};

export type AgentRunConnection = {
  edges: Array<AgentRunEdge>;
  pageInfo: PageInfo;
};

export type AgentRunEdge = {
  cursor: Scalars['String']['output'];
  node: AgentRun;
};

/** Estado de una ejecución de agente. */
export type AgentRunStatus =
  | 'ABORTED'
  | 'FAILED'
  | 'RUNNING'
  | 'SUCCEEDED';

/** Paso de una ejecución de agente. */
export type AgentRunStep = {
  durationMs: Scalars['Int']['output'];
  index: Scalars['Int']['output'];
  input: Maybe<Scalars['JSON']['output']>;
  isError: Scalars['Boolean']['output'];
  /** LLM o TOOL_CALL. */
  kind: Scalars['String']['output'];
  outputSummary: Maybe<Scalars['String']['output']>;
  startedAt: Scalars['DateTime']['output'];
  toolName: Maybe<Scalars['String']['output']>;
};

/** Alerta del agente de monitoreo. */
export type Alert = {
  acknowledgedAt: Maybe<Scalars['DateTime']['output']>;
  acknowledgedBy: Maybe<User>;
  agentRun: Maybe<AgentRun>;
  details: Maybe<Scalars['JSON']['output']>;
  id: Scalars['UUID']['output'];
  kind: AlertKind;
  message: Scalars['String']['output'];
  /** Veces que se detectó mientras seguía abierta. */
  occurrences: Scalars['Int']['output'];
  raisedAt: Scalars['DateTime']['output'];
  /** Recurso afectado (servicio, cola o autor). */
  resource: Maybe<Scalars['String']['output']>;
  severity: AlertSeverity;
  status: AlertStatus;
};

/** Tipo de alerta. */
export type AlertKind =
  | 'DLQ_BACKLOG'
  | 'METRIC_ANOMALY'
  | 'MODERATION_BACKLOG'
  | 'MODERATION_ESCALATION'
  | 'SAGA_FAILURES'
  | 'SERVICE_DOWN';

/** Severidad de una alerta. */
export type AlertSeverity =
  | 'CRITICAL'
  | 'INFO'
  | 'WARNING';

/** Estado de una alerta. */
export type AlertStatus =
  | 'ACKNOWLEDGED'
  | 'OPEN'
  | 'RESOLVED';

/** Denuncia de contenido. */
export type ContentReport = {
  createdAt: Scalars['DateTime']['output'];
  /** Explicación opcional del denunciante. */
  details: Maybe<Scalars['String']['output']>;
  id: Scalars['UUID']['output'];
  /** Post denunciado (o post del comentario denunciado). */
  post: Maybe<Post>;
  reason: ReportReason;
  reporter: Maybe<User>;
  /** Decisión del moderador (null mientras está OPEN). */
  resolution: Maybe<ReportResolution>;
  resolutionNote: Maybe<Scalars['String']['output']>;
  resolvedAt: Maybe<Scalars['DateTime']['output']>;
  resolvedBy: Maybe<User>;
  status: ReportStatus;
  targetId: Scalars['UUID']['output'];
  targetType: ContentReportTargetType;
};

/** Tipo de elemento denunciado (`ReportTargetType`). */
export type ContentReportTargetType =
  | 'COMMENT'
  | 'POST';

export type CreateMcpTokenInput = {
  /** Nombre descriptivo para reconocer el token (p. ej. `Claude Desktop — laptop de Ana`). */
  label?: InputMaybe<Scalars['String']['input']>;
};

export type CreateMcpTokenPayload = {
  errors: Array<UserError>;
  token: Maybe<McpToken>;
};

export type CreateUniversityInput = {
  allowedDomains: Array<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateUniversityPayload = {
  errors: Array<UserError>;
  university: Maybe<University>;
};

/** Punto de la serie de créditos. */
export type CreditStatsPoint = {
  date: Scalars['Date']['output'];
  debitCredits: Scalars['Long']['output'];
  refundCredits: Scalars['Long']['output'];
  topUpCredits: Scalars['Long']['output'];
};

/** Indicadores principales de la plataforma en un rango. */
export type Dashboard = {
  activeUsers: Scalars['Long']['output'];
  comments: Scalars['Long']['output'];
  creditsSpent: Scalars['Long']['output'];
  creditsToppedUp: Scalars['Long']['output'];
  flaggedContent: Scalars['Long']['output'];
  newUsers: Scalars['Long']['output'];
  openAlerts: Scalars['Long']['output'];
  posts: Scalars['Long']['output'];
  range: DateRange;
  reactions: Scalars['Long']['output'];
  registrationsCancelled: Scalars['Long']['output'];
  registrationsConfirmed: Scalars['Long']['output'];
  registrationsFailed: Scalars['Long']['output'];
  series: Array<MetricSeries>;
};

/** Rango de fechas resuelto. */
export type DateRange = {
  from: Scalars['Date']['output'];
  to: Scalars['Date']['output'];
};

/** Rango de fechas inclusivo (UTC). */
export type DateRangeInput = {
  /** Granularidad de las series; por defecto DAY. */
  bucket?: InputMaybe<TimeBucket>;
  from: Scalars['Date']['input'];
  to: Scalars['Date']['input'];
};

/** Evento o taller. */
export type Event = {
  capacity: Scalars['Int']['output'];
  coverUrl: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  description: Maybe<Scalars['String']['output']>;
  id: Scalars['UUID']['output'];
  organizer: Maybe<User>;
  priceCredits: Scalars['Long']['output'];
  /** Inscripciones del evento. */
  registrations: Array<Registration>;
  seatsTaken: Scalars['Int']['output'];
  startsAt: Scalars['DateTime']['output'];
  status: EventStatus;
  title: Scalars['String']['output'];
  venue: Scalars['String']['output'];
};

/** Filtro de eventos. */
export type EventFilter = {
  from?: InputMaybe<Scalars['DateTime']['input']>;
  organizerId?: InputMaybe<Scalars['UUID']['input']>;
  query?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<EventStatus>;
  to?: InputMaybe<Scalars['DateTime']['input']>;
};

/** Estado de un evento. */
export type EventStatus =
  | 'CANCELLED'
  | 'DRAFT'
  | 'FINISHED'
  | 'PUBLISHED';

/** Reporte generativo. */
export type GeneratedReport = {
  agentRun: Maybe<AgentRun>;
  audioDurationSeconds: Maybe<Scalars['Int']['output']>;
  /** URL prefirmada del audio (≤ 90 s). */
  audioUrl: Maybe<Scalars['String']['output']>;
  /** Especificación Vega-Lite v5. */
  chart: Maybe<Scalars['JSON']['output']>;
  completedAt: Maybe<Scalars['DateTime']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Datos tabulares `{ columns: [...], rows: [[...]] }`. */
  dataset: Maybe<Scalars['JSON']['output']>;
  failureReason: Maybe<Scalars['String']['output']>;
  id: Scalars['UUID']['output'];
  locale: Locale;
  markdown: Maybe<Scalars['String']['output']>;
  question: Scalars['String']['output'];
  requestedBy: Maybe<User>;
  status: GeneratedReportStatus;
  title: Maybe<Scalars['String']['output']>;
};

export type GeneratedReportConnection = {
  edges: Array<GeneratedReportEdge>;
  pageInfo: PageInfo;
};

export type GeneratedReportEdge = {
  cursor: Scalars['String']['output'];
  node: GeneratedReport;
};

/** Estado de un reporte generativo (`GeneratedReportStatus`; no confundir con `ReportStatus` de denuncias). */
export type GeneratedReportStatus =
  | 'FAILED'
  | 'PENDING'
  | 'READY'
  | 'RUNNING';

/** Privacidad de un grupo. */
export type GroupPrivacy =
  | 'PRIVATE'
  | 'PUBLIC';

/** Tipo de movimiento de la billetera. */
export type LedgerEntryType =
  | 'DEBIT'
  | 'REFUND'
  | 'TOPUP';

/** Idioma de la interfaz y del contenido generado (D14). */
export type Locale =
  | 'en'
  | 'es';

/**
 * Token para clientes MCP externos (D9, ADR-0016): JWT de 8 h con `aud=mcp` y scope `mcp:tools`,
 * emitido por identity (`createMcpToken`). `accessToken` solo se devuelve en la mutación que lo crea.
 */
export type McpToken = {
  /** JWT del token; se muestra una sola vez. */
  accessToken: Scalars['String']['output'];
  audience: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['UUID']['output'];
  label: Maybe<Scalars['String']['output']>;
  scopes: Array<Scalars['String']['output']>;
};

/** Medio subido por un usuario. */
export type MediaAsset = {
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['UUID']['output'];
  kind: MediaKind;
  moderation: Maybe<ModerationResult>;
  ocrText: Maybe<Scalars['String']['output']>;
  owner: Maybe<User>;
  /** URL prefirmada de vista previa (expira). */
  previewUrl: Maybe<Scalars['String']['output']>;
  purpose: MediaPurpose;
  status: MediaStatus;
  tags: Array<Scalars['String']['output']>;
  thumbnailUrl: Maybe<Scalars['String']['output']>;
};

/** Tipo de medio. */
export type MediaKind =
  | 'IMAGE'
  | 'VIDEO';

/** Uso de un medio. */
export type MediaPurpose =
  | 'AVATAR'
  | 'EVENT_COVER'
  | 'POST';

/** Decisión de un moderador sobre un medio marcado. */
export type MediaReviewDecision =
  /** Aprueba el medio (pasa a APPROVED y se publican los posts que lo esperaban). */
  | 'APPROVE'
  /** Rechaza el medio (pasa a REJECTED y se ocultan los posts que lo contienen). */
  | 'REJECT';

/** Estado de un medio. */
export type MediaStatus =
  | 'APPROVED'
  | 'FLAGGED'
  | 'PENDING_UPLOAD'
  | 'PROCESSING'
  | 'REJECTED';

/** Estado de una membresía de grupo. */
export type MembershipStatus =
  | 'ACTIVE'
  | 'LEFT'
  | 'PENDING'
  | 'REJECTED';

/** Punto de una serie temporal. */
export type MetricPoint = {
  date: Scalars['Date']['output'];
  value: Scalars['Long']['output'];
};

/** Serie temporal con nombre. */
export type MetricSeries = {
  /** Nombre estable de la métrica (p. ej. `registrationsConfirmed`). */
  name: Scalars['String']['output'];
  points: Array<MetricPoint>;
};

export type ModerateMediaPayload = {
  errors: Array<UserError>;
  media: Maybe<MediaAsset>;
};

/** Decisión automática del modelo de moderación. */
export type ModerationDecision =
  | 'ALLOW'
  | 'BLOCK'
  | 'REVIEW';

/** Elemento de la cola de moderación (medio marcado o post ocultado por denuncias). */
export type ModerationItem = {
  enqueuedAt: Scalars['DateTime']['output'];
  /** Id del elemento (id del medio o del post). */
  id: Scalars['UUID']['output'];
  media: Maybe<MediaAsset>;
  /** Denuncias abiertas asociadas. */
  openReports: Scalars['Int']['output'];
  post: Maybe<Post>;
  source: ModerationSource;
};

export type ModerationItemConnection = {
  edges: Array<ModerationItemEdge>;
  pageInfo: PageInfo;
  /** Total aproximado de elementos pendientes. */
  totalCount: Scalars['Int']['output'];
};

export type ModerationItemEdge = {
  cursor: Scalars['String']['output'];
  node: ModerationItem;
};

/** Cambio en la cola de moderación (suscripción). */
export type ModerationQueueChange = {
  item: ModerationItem;
  /** Total pendiente tras el cambio. */
  totalCount: Scalars['Int']['output'];
  type: ModerationQueueChangeType;
};

/** Tipo de cambio en la cola de moderación. */
export type ModerationQueueChangeType =
  | 'ADDED'
  | 'RESOLVED';

/** Filtro de la cola de moderación. */
export type ModerationQueueFilter = {
  kind?: InputMaybe<MediaKind>;
  /** Solo elementos con puntaje máximo ≥ este valor. */
  minScore?: InputMaybe<Scalars['Float']['input']>;
  source?: InputMaybe<ModerationSource>;
};

/** Resultado del modelo de moderación sobre un medio. */
export type ModerationResult = {
  decision: ModerationDecision;
  labels: Array<Scalars['String']['output']>;
  maxScore: Scalars['Float']['output'];
  modelVersion: Scalars['String']['output'];
  /** Puntajes por etiqueta (0–1), p. ej. `{"nsfw": 0.71}`. */
  scores: Scalars['JSON']['output'];
};

/** Origen de un elemento de la cola de moderación. */
export type ModerationSource =
  /** Marcado por el modelo de IA. */
  | 'AI'
  /** Ocultado por denuncias de usuarios. */
  | 'REPORTS';

export type Mutation = {
  /** Reconoce una alerta. */
  acknowledgeAlert: AcknowledgeAlertPayload;
  /**
   * Emite un token MCP de 8 h para un cliente externo (identity `createMcpToken`, D9/D15, UC-22).
   * El `accessToken` se devuelve una sola vez.
   */
  createMcpToken: CreateMcpTokenPayload;
  /** Habilita una universidad nueva. */
  createUniversity: CreateUniversityPayload;
  /** Aprueba o rechaza un medio marcado. */
  moderateMedia: ModerateMediaPayload;
  /** Reactiva una cuenta suspendida. */
  reactivateUser: ReactivateUserPayload;
  /** Solicita un reporte generativo; el idioma por defecto es el del usuario (D14). */
  requestReport: RequestReportPayload;
  /** Resuelve una denuncia de contenido. */
  resolveContentReport: ResolveContentReportPayload;
  /**
   * Reimpulsa una SAGA `FAILED` desde el paso en que quedó (events `retrySaga`, D15, UC-13).
   * Errores de negocio: `SAGA_NOT_RETRYABLE`, `NOT_FOUND`.
   */
  retrySaga: RetrySagaPayload;
  /** Revoca un token MCP antes de que expire (identity `revokeMcpToken`). */
  revokeMcpToken: RevokeMcpTokenPayload;
  /** Ejecuta el agente de monitoreo inmediatamente. */
  runMonitoringNow: RunMonitoringPayload;
  /** Suspende una cuenta (revoca sus sesiones). */
  suspendUser: SuspendUserPayload;
  /** Reemplaza los roles de un usuario. */
  updateUserRoles: UpdateUserRolesPayload;
};


export type MutationAcknowledgeAlertArgs = {
  id: Scalars['UUID']['input'];
};


export type MutationCreateMcpTokenArgs = {
  input?: InputMaybe<CreateMcpTokenInput>;
};


export type MutationCreateUniversityArgs = {
  input: CreateUniversityInput;
};


export type MutationModerateMediaArgs = {
  decision: MediaReviewDecision;
  id: Scalars['UUID']['input'];
  note?: InputMaybe<Scalars['String']['input']>;
};


export type MutationReactivateUserArgs = {
  input: ReactivateUserInput;
};


export type MutationRequestReportArgs = {
  locale?: InputMaybe<Locale>;
  question: Scalars['String']['input'];
};


export type MutationResolveContentReportArgs = {
  input: ResolveContentReportInput;
};


export type MutationRetrySagaArgs = {
  id: Scalars['UUID']['input'];
};


export type MutationRevokeMcpTokenArgs = {
  id: Scalars['UUID']['input'];
};


export type MutationSuspendUserArgs = {
  input: SuspendUserInput;
};


export type MutationUpdateUserRolesArgs = {
  input: UpdateUserRolesInput;
};

/** Tipo de notificación. */
export type NotificationType =
  | 'ALERT'
  | 'CONTENT_FLAGGED'
  | 'EVENT_CANCELLED'
  | 'EVENT_REMINDER'
  | 'GROUP_REQUEST'
  | 'NEW_COMMENT'
  | 'NEW_EVENT'
  | 'NEW_FOLLOWER'
  | 'NEW_REACTION'
  | 'REGISTRATION_CANCELLED'
  | 'REGISTRATION_CONFIRMED'
  | 'REGISTRATION_FAILED'
  | 'TOPUP_PAID'
  | 'WELCOME';

/** Información de paginación Relay. */
export type PageInfo = {
  endCursor: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor: Maybe<Scalars['String']['output']>;
};

/** Post de la red social (vista de moderación). */
export type Post = {
  author: Maybe<User>;
  createdAt: Scalars['DateTime']['output'];
  hashtags: Array<Scalars['String']['output']>;
  id: Scalars['UUID']['output'];
  media: Array<MediaAsset>;
  status: PostStatus;
  text: Maybe<Scalars['String']['output']>;
  visibility: PostVisibility;
};

/** Estado de un post. */
export type PostStatus =
  | 'HIDDEN'
  | 'PENDING_MEDIA'
  | 'PUBLISHED'
  | 'REMOVED';

/** Visibilidad de un post. */
export type PostVisibility =
  | 'FOLLOWERS'
  | 'GROUP'
  | 'PUBLIC';

export type Query = {
  /** Ejecuciones de agentes (más recientes primero). */
  agentRuns: AgentRunConnection;
  /** Alertas por estado. */
  alerts: Array<Alert>;
  /** Denuncias de contenido. */
  contentReports: Array<ContentReport>;
  /** KPIs y series de la plataforma en un rango. */
  dashboard: Dashboard;
  /** Evento por id. */
  event: Maybe<Event>;
  /** Eventos según filtro. */
  events: Array<Event>;
  /** Usuario autenticado en el panel. */
  me: User;
  /** Cola de moderación (medios marcados por IA y posts ocultos por denuncias). */
  moderationQueue: ModerationItemConnection;
  /** Inscripciones de un evento. */
  registrations: Array<Registration>;
  /** Reporte por id. */
  report: Maybe<GeneratedReport>;
  /** Reportes generativos (más recientes primero). */
  reports: GeneratedReportConnection;
  /** SAGAs por estado (p. ej. FAILED o COMPENSATED). */
  sagas: Array<SagaInstance>;
  /** Salud de servicios, colas y DLQ. */
  serviceHealth: ServiceHealthReport;
  /** Universidades habilitadas. */
  universities: Array<University>;
  /** Usuario por id. */
  user: Maybe<User>;
  /** Búsqueda paginada de usuarios. */
  users: UserConnection;
  /** Estadísticas de créditos. */
  walletStats: WalletStats;
};


export type QueryAgentRunsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  agent?: InputMaybe<AgentKind>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAlertsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  severity?: InputMaybe<AlertSeverity>;
  status?: InputMaybe<AlertStatus>;
};


export type QueryContentReportsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<ReportStatus>;
  targetType?: InputMaybe<ContentReportTargetType>;
};


export type QueryDashboardArgs = {
  range: DateRangeInput;
};


export type QueryEventArgs = {
  id: Scalars['UUID']['input'];
};


export type QueryEventsArgs = {
  filter?: InputMaybe<EventFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryModerationQueueArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<ModerationQueueFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryRegistrationsArgs = {
  eventId: Scalars['UUID']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<RegistrationStatus>;
};


export type QueryReportArgs = {
  id: Scalars['UUID']['input'];
};


export type QueryReportsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  status?: InputMaybe<GeneratedReportStatus>;
};


export type QuerySagasArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  since?: InputMaybe<Scalars['DateTime']['input']>;
  status?: InputMaybe<SagaStatus>;
  type?: InputMaybe<SagaType>;
};


export type QueryUserArgs = {
  id: Scalars['UUID']['input'];
};


export type QueryUsersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<UserFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryWalletStatsArgs = {
  range: DateRangeInput;
};

/** Estado de una cola de RabbitMQ. */
export type QueueHealth = {
  consumers: Scalars['Int']['output'];
  isDeadLetter: Scalars['Boolean']['output'];
  messagesReady: Scalars['Long']['output'];
  messagesUnacked: Scalars['Long']['output'];
  name: Scalars['String']['output'];
};

/** Tipo de reacción. */
export type ReactionType =
  | 'FUNNY'
  | 'HELPFUL'
  | 'LIKE'
  | 'SUPPORT';

export type ReactivateUserInput = {
  note?: InputMaybe<Scalars['String']['input']>;
  userId: Scalars['UUID']['input'];
};

export type ReactivateUserPayload = {
  errors: Array<UserError>;
  user: Maybe<User>;
};

/** Inscripción a un evento. */
export type Registration = {
  createdAt: Scalars['DateTime']['output'];
  eventId: Scalars['UUID']['output'];
  failureReason: Maybe<RegistrationFailureReason>;
  id: Scalars['UUID']['output'];
  saga: Maybe<SagaInstance>;
  status: RegistrationStatus;
  updatedAt: Scalars['DateTime']['output'];
  user: Maybe<User>;
};

/** Motivo de fallo de una inscripción. */
export type RegistrationFailureReason =
  | 'EVENT_FULL'
  | 'INSUFFICIENT_FUNDS'
  | 'SAGA_ABORTED'
  | 'TICKET_ISSUE_FAILED'
  | 'TIMEOUT'
  | 'WALLET_NOT_FOUND';

/** Estado de una inscripción. */
export type RegistrationStatus =
  | 'CANCELLATION_PENDING'
  | 'CANCELLED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'PENDING';

/** Motivo de una denuncia. */
export type ReportReason =
  | 'HARASSMENT'
  | 'MISINFORMATION'
  | 'NSFW'
  | 'OTHER'
  | 'SPAM'
  | 'VIOLENCE';

/** Resolución de una denuncia (`ReportResolution`). */
export type ReportResolution =
  /** Mantener el contenido (RESOLVED_KEPT). */
  | 'KEEP'
  /** Retirar el contenido (RESOLVED_REMOVED). */
  | 'REMOVE';

/** Estado de una denuncia de contenido. */
export type ReportStatus =
  | 'OPEN'
  | 'RESOLVED_KEPT'
  | 'RESOLVED_REMOVED';

export type RequestReportPayload = {
  errors: Array<UserError>;
  report: Maybe<GeneratedReport>;
};

export type ResolveContentReportInput = {
  note?: InputMaybe<Scalars['String']['input']>;
  reportId: Scalars['UUID']['input'];
  resolution: ReportResolution;
};

export type ResolveContentReportPayload = {
  errors: Array<UserError>;
  report: Maybe<ContentReport>;
};

export type RetrySagaPayload = {
  errors: Array<UserError>;
  /** SAGA reanudada (o su estado actual si ya no estaba FAILED). */
  saga: Maybe<SagaInstance>;
};

export type RevokeMcpTokenPayload = {
  errors: Array<UserError>;
  /** Id del token revocado. */
  revokedId: Maybe<Scalars['UUID']['output']>;
};

/** Rol de un usuario. Un usuario tiene uno o más roles. */
export type Role =
  | 'ADMIN'
  | 'MODERATOR'
  | 'ORGANIZER'
  | 'STUDENT';

export type RunMonitoringPayload = {
  agentRun: Maybe<AgentRun>;
  errors: Array<UserError>;
};

/** Instancia de SAGA de inscripción o cancelación. */
export type SagaInstance = {
  deadlineAt: Maybe<Scalars['DateTime']['output']>;
  failureReason: Maybe<RegistrationFailureReason>;
  id: Scalars['UUID']['output'];
  registrationId: Scalars['UUID']['output'];
  /** Reintentos del comando del paso actual. */
  retries: Scalars['Int']['output'];
  startedAt: Scalars['DateTime']['output'];
  status: SagaStatus;
  /** Paso actual o último ejecutado. */
  step: SagaStep;
  type: SagaType;
  updatedAt: Scalars['DateTime']['output'];
};

/** Estado de una SAGA. */
export type SagaStatus =
  | 'AWAITING_DEBIT'
  | 'AWAITING_TICKET'
  | 'COMPENSATED'
  | 'COMPENSATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'STARTED';

/** Paso de una SAGA (D2). */
export type SagaStep =
  | 'DEBIT_CREDITS'
  | 'ISSUE_TICKET'
  | 'REFUND_CREDITS'
  | 'RELEASE_SEAT'
  | 'RESERVE_SEAT'
  | 'VOID_TICKET';

/** Tipo de SAGA. */
export type SagaType =
  | 'CANCELLATION'
  | 'REGISTRATION';

/** Salud de un servicio. */
export type ServiceHealth = {
  /** Resultado por dependencia, p. ej. `{"db": "UP", "broker": "UP"}`. */
  checks: Maybe<Scalars['JSON']['output']>;
  error: Maybe<Scalars['String']['output']>;
  latencyMs: Maybe<Scalars['Int']['output']>;
  name: Scalars['String']['output'];
  status: ServiceStatus;
};

/** Salud agregada de la plataforma. */
export type ServiceHealthReport = {
  checkedAt: Scalars['DateTime']['output'];
  overall: ServiceStatus;
  queues: Array<QueueHealth>;
  services: Array<ServiceHealth>;
};

/** Estado de salud de un servicio. */
export type ServiceStatus =
  | 'DEGRADED'
  | 'DOWN'
  | 'UP';

export type Subscription = {
  /** Alertas nuevas (origen: `bandada.insights.alert.raised.v1`). */
  alertRaised: Alert;
  /**
   * Cambios en la cola de moderación (origen: eventos `bandada.media.asset.*`,
   * `bandada.social.content.reported.v1` y `bandada.social.post.hidden.v1`, recibidos por la cola
   * `admin-gateway.subscriptions.<instanceId>`).
   */
  moderationQueueChanged: ModerationQueueChange;
  /** Se emite cuando el reporte indicado termina (origen: `bandada.insights.report.ready.v1`). */
  reportReady: GeneratedReport;
};


export type SubscriptionAlertRaisedArgs = {
  minSeverity?: InputMaybe<AlertSeverity>;
};


export type SubscriptionReportReadyArgs = {
  id: Scalars['UUID']['input'];
};

export type SuspendUserInput = {
  reason: Scalars['String']['input'];
  /** Fin de la suspensión; null = indefinida. */
  until?: InputMaybe<Scalars['DateTime']['input']>;
  userId: Scalars['UUID']['input'];
};

export type SuspendUserPayload = {
  errors: Array<UserError>;
  user: Maybe<User>;
};

/** Preferencia de tema visual (D13). */
export type ThemePreference =
  | 'DARK'
  | 'LIGHT'
  | 'SYSTEM';

/** Estado de un ticket. */
export type TicketStatus =
  | 'ISSUED'
  | 'USED'
  | 'VOIDED';

/** Granularidad de una serie temporal. */
export type TimeBucket =
  | 'DAY'
  | 'MONTH'
  | 'WEEK';

/** Consumo de tokens del LLM. */
export type TokenUsage = {
  input: Scalars['Long']['output'];
  output: Scalars['Long']['output'];
  total: Scalars['Long']['output'];
};

/** Estado de una recarga. */
export type TopUpStatus =
  | 'EXPIRED'
  | 'FAILED'
  | 'PAID'
  | 'PENDING';

/** Universidad habilitada para el registro. */
export type University = {
  /** Dominios de correo institucional permitidos (p. ej. `umsa.bo`). */
  allowedDomains: Array<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Si admite registros nuevos (RF-01). */
  enabled: Scalars['Boolean']['output'];
  id: Scalars['UUID']['output'];
  name: Scalars['String']['output'];
};

export type UpdateUserRolesInput = {
  /** Conjunto completo de roles resultante (mínimo uno). */
  roles: Array<Role>;
  userId: Scalars['UUID']['input'];
};

export type UpdateUserRolesPayload = {
  errors: Array<UserError>;
  user: Maybe<User>;
};

/** Usuario de la plataforma (datos de identity + perfil social). */
export type User = {
  avatarUrl: Maybe<Scalars['String']['output']>;
  career: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  /** Nombre visible (perfil social). */
  displayName: Maybe<Scalars['String']['output']>;
  email: Scalars['String']['output'];
  emailVerifiedAt: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['UUID']['output'];
  /** Idioma preferido (D14). */
  locale: Locale;
  roles: Array<Role>;
  semester: Maybe<Scalars['Int']['output']>;
  status: UserStatus;
  /** Fecha de suspensión vigente, si existe. */
  suspendedAt: Maybe<Scalars['DateTime']['output']>;
  /** Motivo de la suspensión vigente. */
  suspensionReason: Maybe<Scalars['String']['output']>;
  /** Tema preferido (D13). */
  theme: ThemePreference;
  university: Maybe<University>;
};

export type UserConnection = {
  edges: Array<UserEdge>;
  pageInfo: PageInfo;
};

export type UserEdge = {
  cursor: Scalars['String']['output'];
  node: User;
};

/** Error de negocio devuelto por una mutación. */
export type UserError = {
  /** Código estable (mismo `code` que los Problem Details REST). */
  code: Scalars['String']['output'];
  /** Ruta del campo de entrada afectado, si aplica. */
  field: Maybe<Array<Scalars['String']['output']>>;
  /** Mensaje localizado según Accept-Language. */
  message: Scalars['String']['output'];
};

/** Filtro de búsqueda de usuarios. */
export type UserFilter = {
  /** Texto libre sobre correo o nombre visible. */
  query?: InputMaybe<Scalars['String']['input']>;
  role?: InputMaybe<Role>;
  status?: InputMaybe<UserStatus>;
  universityId?: InputMaybe<Scalars['UUID']['input']>;
};

/** Estado de la cuenta de usuario. */
export type UserStatus =
  | 'ACTIVE'
  | 'DELETED'
  | 'PENDING_VERIFICATION'
  | 'SUSPENDED';

/** Estadísticas agregadas de créditos. */
export type WalletStats = {
  circulatingCredits: Maybe<Scalars['Long']['output']>;
  debitCount: Scalars['Long']['output'];
  debitCredits: Scalars['Long']['output'];
  netCredits: Scalars['Long']['output'];
  range: DateRange;
  refundCount: Scalars['Long']['output'];
  refundCredits: Scalars['Long']['output'];
  series: Array<CreditStatsPoint>;
  topUpCount: Scalars['Long']['output'];
  topUpCredits: Scalars['Long']['output'];
};
