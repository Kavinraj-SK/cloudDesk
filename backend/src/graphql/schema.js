const { gql } = require('graphql-tag');

const typeDefs = gql`
  type Session {
    id: ID!
    deskId: String!
    hostName: String
    status: SessionStatus!
    createdAt: String!
    connectedAt: String
    duration: Int
  }

  type DeskInfo {
    deskId: String!
    alias: String
    isOnline: Boolean!
    sessionCount: Int!
  }

  type ConnectionResult {
    success: Boolean!
    sessionId: String
    message: String
    peerDeskId: String
  }

  type SessionStats {
    totalSessions: Int!
    activeSessions: Int!
    totalUsers: Int!
    avgDuration: Float!
  }

  enum SessionStatus {
    WAITING
    CONNECTED
    DISCONNECTED
    FAILED
  }

  type Query {
    getSession(sessionId: ID!): Session
    getDeskInfo(deskId: String!): DeskInfo
    getSessionStats: SessionStats
    activeSessions: [Session!]!
    sessionHistory(deskId: String!): [Session!]!
  }

  type Mutation {
    registerDesk(alias: String): DeskInfo!
    createSession(hostDeskId: String!): Session!
    endSession(sessionId: ID!): Boolean!
    updateAlias(deskId: String!, alias: String!): DeskInfo!
  }

  type Subscription {
    sessionStatusChanged(sessionId: ID!): Session
    deskStatusChanged(deskId: String!): DeskInfo
  }
`;

module.exports = { typeDefs };
