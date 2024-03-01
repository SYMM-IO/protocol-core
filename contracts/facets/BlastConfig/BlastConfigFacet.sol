// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../../utils/Accessibility.sol";
import "./IBlast.sol";

contract BlastConfigFacet is Accessibility {
    IBlast public constant BLAST = IBlast(0x4300000000000000000000000000000000000002);

    function configureYield() external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        BLAST.configureClaimableYield();
        BLAST.configureClaimableGas();
    }

    function claimYield(address recipient, uint256 amount) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        require(recipient != address(this), "BlastConfigFacet: recipient can not be the contract itself");
        BLAST.claimYield(address(this), recipient, amount);
    }

    function claimAllYield(address recipient) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        require(recipient != address(this), "BlastConfigFacet: recipient can not be the contract itself");
        BLAST.claimAllYield(address(this), recipient);
    }

    function claimAllGas(address recipient) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        require(recipient != address(this), "BlastConfigFacet: recipient can not be the contract itself");
        BLAST.claimAllGas(address(this), recipient);
    }

    function claimMaxGas(address recipient) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        require(recipient != address(this), "BlastConfigFacet: recipient can not be the contract itself");
        BLAST.claimMaxGas(address(this), recipient);
    }

    function claimGasAtMinClaimRate(address recipient, uint256 minRate) external onlyRole(LibAccessibility.DEFAULT_ADMIN_ROLE) {
        require(recipient != address(this), "BlastConfigFacet: recipient can not be the contract itself");
        BLAST.claimGasAtMinClaimRate(address(this), recipient, minRate);
    }
}
