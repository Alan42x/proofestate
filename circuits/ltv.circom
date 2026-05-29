pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mimcsponge.circom";

template LtvCompliance(valueBits, productBits) {
    signal input propertyKeyField;
    signal input valuationCommitment;
    signal input principalCommitment;
    signal input maxLtvBps;

    signal input propertyValue;
    signal input loanPrincipal;
    signal input valuationSalt;
    signal input principalSalt;

    component propertyValueRange = Num2Bits(valueBits);
    propertyValueRange.in <== propertyValue;

    component loanPrincipalRange = Num2Bits(valueBits);
    loanPrincipalRange.in <== loanPrincipal;

    component maxLtvRange = Num2Bits(14);
    maxLtvRange.in <== maxLtvBps;

    component valuationHash = MiMCSponge(3, 220, 1);
    valuationHash.k <== 0;
    valuationHash.ins[0] <== propertyKeyField;
    valuationHash.ins[1] <== propertyValue;
    valuationHash.ins[2] <== valuationSalt;
    valuationHash.outs[0] === valuationCommitment;

    component principalHash = MiMCSponge(3, 220, 1);
    principalHash.k <== 0;
    principalHash.ins[0] <== propertyKeyField;
    principalHash.ins[1] <== loanPrincipal;
    principalHash.ins[2] <== principalSalt;
    principalHash.outs[0] === principalCommitment;

    signal loanPrincipalBps;
    signal propertyValueMaxBps;

    loanPrincipalBps <== loanPrincipal * 10000;
    propertyValueMaxBps <== propertyValue * maxLtvBps;

    component lessThan = LessThan(productBits);
    lessThan.in[0] <== loanPrincipalBps;
    lessThan.in[1] <== propertyValueMaxBps + 1;
    lessThan.out === 1;
}

component main { public [propertyKeyField, valuationCommitment, principalCommitment, maxLtvBps] } = LtvCompliance(64, 80);
