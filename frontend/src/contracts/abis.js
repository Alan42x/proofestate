export const propertyVerificationAbi = [
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
  }
];

export const lendingAbi = [
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
