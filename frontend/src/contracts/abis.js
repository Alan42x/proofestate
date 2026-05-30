export const propertyVerificationAbi = [
  {
    type: "event",
    name: "RoleGranted",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "RoleRevoked",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "PropertyVerificationUpdated",
    inputs: [
      { name: "propertyId", type: "bytes32", indexed: true },
      { name: "verified", type: "bool", indexed: false },
      { name: "owner", type: "address", indexed: true },
      { name: "evidenceHash", type: "bytes32", indexed: false },
      { name: "valuationCommitment", type: "uint256", indexed: false },
      { name: "lastUpdated", type: "uint64", indexed: false }
    ]
  },
  {
    type: "event",
    name: "PropertyComplianceUpdated",
    inputs: [
      { name: "propertyId", type: "bytes32", indexed: true },
      { name: "compliant", type: "bool", indexed: false },
      { name: "proofHash", type: "bytes32", indexed: false },
      { name: "principalCommitment", type: "uint256", indexed: false },
      { name: "lastUpdated", type: "uint64", indexed: false }
    ]
  },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "ORACLE_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "COMPLIANCE_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "revokeRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getRecord",
    stateMutability: "view",
    inputs: [{ name: "propertyId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "verified", type: "bool" },
          { name: "compliant", type: "bool" },
          { name: "owner", type: "address" },
          { name: "evidenceHash", type: "bytes32" },
          { name: "complianceHash", type: "bytes32" },
          { name: "valuationCommitment", type: "uint256" },
          { name: "principalCommitment", type: "uint256" },
          { name: "lastUpdated", type: "uint64" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "isVerified",
    stateMutability: "view",
    inputs: [{ name: "propertyId", type: "bytes32" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "isCompliant",
    stateMutability: "view",
    inputs: [{ name: "propertyId", type: "bytes32" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "isCompliantFor",
    stateMutability: "view",
    inputs: [
      { name: "propertyId", type: "bytes32" },
      { name: "principalCommitment", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "propertyId", type: "bytes32" }],
    outputs: [{ type: "address" }]
  }
];

export const lendingAbi = [
  {
    type: "event",
    name: "RoleGranted",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "RoleRevoked",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "LoanRequested",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "borrower", type: "address", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true },
      { name: "principalCommitment", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "LoanApproved",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "LoanRejected",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "LoanRejectedDueToVerification",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "LoanRejectedDueToCompliance",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true }
    ]
  },
  {
    type: "event",
    name: "LoanRejectedDueToProofMismatch",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true },
      { name: "principalCommitment", type: "uint256", indexed: false }
    ]
  },
  {
    type: "event",
    name: "LoanRepaid",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "borrower", type: "address", indexed: true }
    ]
  },
  {
    type: "event",
    name: "LoanCancelled",
    inputs: [
      { name: "loanId", type: "uint256", indexed: true },
      { name: "propertyId", type: "bytes32", indexed: true },
      { name: "borrower", type: "address", indexed: false }
    ]
  },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "LOAN_OFFICER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }]
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "revokeRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "nextLoanId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "requestLoan",
    stateMutability: "nonpayable",
    inputs: [
      { name: "propertyId", type: "bytes32" },
      { name: "principalCommitment", type: "uint256" }
    ],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "approveLoan",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [{ type: "bool" }]
  },
  {
    type: "function",
    name: "rejectLoan",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "repay",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "cancelLoan",
    stateMutability: "nonpayable",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "getLoan",
    stateMutability: "view",
    inputs: [{ name: "loanId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "borrower", type: "address" },
          { name: "propertyId", type: "bytes32" },
          { name: "principalCommitment", type: "uint256" },
          { name: "interestRateBps", type: "uint256" },
          { name: "termDays", type: "uint256" },
          { name: "state", type: "uint8" },
          { name: "requestedAt", type: "uint256" },
          { name: "approvedAt", type: "uint256" },
          { name: "repaidAt", type: "uint256" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "activeLoanIdOf",
    stateMutability: "view",
    inputs: [{ name: "propertyId", type: "bytes32" }],
    outputs: [
      { name: "loanId", type: "uint256" },
      { name: "exists", type: "bool" }
    ]
  },
  {
    type: "function",
    name: "loanIdsOfProperty",
    stateMutability: "view",
    inputs: [{ name: "propertyId", type: "bytes32" }],
    outputs: [{ type: "uint256[]" }]
  }
];
