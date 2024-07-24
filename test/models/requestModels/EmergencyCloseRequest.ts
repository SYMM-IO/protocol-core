import {Builder} from "builder-pattern"
import {BigNumberish} from "ethers"

import {decimal} from "../../utils/Common"

export interface EmergencyCloseRequest {
	upnlPartyA: BigNumberish
	upnlPartyB: BigNumberish
	price: BigNumberish
}

const defaultEmergencyCloseRequest: EmergencyCloseRequest = {
	upnlPartyA: 0,
	upnlPartyB: 0,
	price: decimal(1n),
}

export const emergencyCloseRequestBuilder = () => Builder(defaultEmergencyCloseRequest)
