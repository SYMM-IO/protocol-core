// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/SymbolStorage.sol";
import "hardhat/console.sol";

library LibFundingRate {
	function getEpochOfTimestamp(uint256 timestamp, uint256 epochDuration) internal pure returns (uint256) {
		require(epochDuration > 0, "FundingRateFacet: Zero epoch duration");
		return timestamp / epochDuration;
	}

	function getCurrentAccumulatedRate(FundingFee memory fundingFee) internal view returns (int256 accumulatedLongRate, int256 accumulatedShortRate) {
		uint256 currentEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		uint256 newEpochs = currentEpoch - fundingFee.lastUpdatedEpoch;
		uint256 previousEpochs = fundingFee.lastUpdatedEpoch - fundingFee.startEpoch;
		console.log("fundingFee.lastUpdatedEpoch:", fundingFee.lastUpdatedEpoch);
		console.log("fundingFee.startEpoch:", fundingFee.startEpoch);

		console.log("Current epoch:", currentEpoch);
		console.log("New epochs:", newEpochs);
		console.log("Previous epochs:", previousEpochs);

		if (previousEpochs == 0 && newEpochs == 0) {
			accumulatedLongRate = int256(fundingFee.accumulatedLongRate);
			accumulatedShortRate = int256(fundingFee.accumulatedShortRate);
			console.log("Early return - Accumulated rates (long, short):", uint256(accumulatedLongRate), uint256(accumulatedShortRate));
			return (accumulatedLongRate, accumulatedShortRate);
		}

		uint256 totalEpochs = previousEpochs + newEpochs;
		console.log("Total epochs:", totalEpochs);
		console.log("Current rates (long, short):", uint256(fundingFee.currentLongRate), uint256(fundingFee.currentShortRate));

		accumulatedLongRate =
			(fundingFee.accumulatedLongRate * int256(previousEpochs) + fundingFee.currentLongRate * int256(newEpochs)) /
			int256(totalEpochs);

		accumulatedShortRate =
			(fundingFee.accumulatedShortRate * int256(previousEpochs) + fundingFee.currentShortRate * int256(newEpochs)) /
			int256(totalEpochs);

		console.log("New accumulated rates (long, short):", uint256(accumulatedLongRate), uint256(accumulatedShortRate));
	}

	function updateAccumulatedRates(FundingFee storage fundingFee) internal {
		console.log("Updating accumulated rates...");
		(fundingFee.accumulatedLongRate, fundingFee.accumulatedShortRate) = getCurrentAccumulatedRate(fundingFee);
		fundingFee.lastUpdatedEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		console.log("Updated lastUpdatedEpoch to:", fundingFee.lastUpdatedEpoch);
	}
}
