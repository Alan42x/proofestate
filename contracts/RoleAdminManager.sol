// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IRoleManagedAccessControl {
    function grantRole(bytes32 role, address account) external;
    function revokeRole(bytes32 role, address account) external;
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract RoleAdminManager is AccessControl {
    bytes32 private constant PROTOCOL_ADMIN_ROLE = 0x00;

    IRoleManagedAccessControl public immutable propertyVerification;
    IRoleManagedAccessControl public immutable lending;

    event ProtocolAdminGranted(address indexed account, address indexed sender);
    event ProtocolAdminRevoked(address indexed account, address indexed sender);

    error InvalidManagedContract();
    error InvalidAccount();
    error LastProtocolAdmin();

    uint256 public protocolAdminCount;

    constructor(address propertyVerificationAddress, address lendingAddress, address admin) {
        if (propertyVerificationAddress == address(0) || lendingAddress == address(0)) {
            revert InvalidManagedContract();
        }

        propertyVerification = IRoleManagedAccessControl(propertyVerificationAddress);
        lending = IRoleManagedAccessControl(lendingAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, admin == address(0) ? msg.sender : admin);
    }

    function grantProtocolAdmin(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert InvalidAccount();

        _grantRole(DEFAULT_ADMIN_ROLE, account);
        propertyVerification.grantRole(PROTOCOL_ADMIN_ROLE, account);
        lending.grantRole(PROTOCOL_ADMIN_ROLE, account);

        emit ProtocolAdminGranted(account, msg.sender);
    }

    function revokeProtocolAdmin(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0) || account == address(this)) revert InvalidAccount();

        propertyVerification.revokeRole(PROTOCOL_ADMIN_ROLE, account);
        lending.revokeRole(PROTOCOL_ADMIN_ROLE, account);
        _revokeRole(DEFAULT_ADMIN_ROLE, account);

        emit ProtocolAdminRevoked(account, msg.sender);
    }

    function hasProtocolAdmin(address account)
        external
        view
        returns (bool managerAdmin, bool propertyAdmin, bool lendingAdmin, bool complete)
    {
        managerAdmin = hasRole(DEFAULT_ADMIN_ROLE, account);
        propertyAdmin = propertyVerification.hasRole(PROTOCOL_ADMIN_ROLE, account);
        lendingAdmin = lending.hasRole(PROTOCOL_ADMIN_ROLE, account);
        complete = managerAdmin && propertyAdmin && lendingAdmin;
    }

    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == DEFAULT_ADMIN_ROLE && account == address(0)) revert InvalidAccount();

        bool granted = super._grantRole(role, account);
        if (granted && role == DEFAULT_ADMIN_ROLE) {
            protocolAdminCount += 1;
        }
        return granted;
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool) {
        if (role == DEFAULT_ADMIN_ROLE && hasRole(role, account) && protocolAdminCount <= 1) {
            revert LastProtocolAdmin();
        }

        bool revoked = super._revokeRole(role, account);
        if (revoked && role == DEFAULT_ADMIN_ROLE) {
            protocolAdminCount -= 1;
        }
        return revoked;
    }
}
