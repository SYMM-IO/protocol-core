// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;
import "./IFundingRateEvents.sol";
import "../../storages/MuonStorage.sol";

interface IFundingRateFacet is IFundingRateEvents {
	function chargeFundingRate(address partyA, uint256[] memory quoteIds, int256[] memory rates, PairUpnlSig memory upnlSig) external;
	function setFundingFee(uint256[] memory symbolIds, int256[] memory longFees, int256[] memory shortFees) external;
	function setShortFundingFee(uint256[] memory symbolIds, int256[] memory shortFees) external;
	function setLongFundingFee(uint256[] memory symbolIds, int256[] memory longFees) external;
	function setEpochDurations(uint256[] memory symbolIds, uint256[] memory durations) external;
	function chargeAccumulatedFundingFee(address partyA, address partyB, uint256[] memory quoteIds, PairUpnlSig memory upnlSig) external;
}
