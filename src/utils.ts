/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-unused-vars */
// external
import axios from 'axios';
import { ethers } from 'ethers';
import { currencies } from './constants';
import { DecodedOSLogData, IndividualConsideration, IndividualOffer } from './types';
// local

/**
 * Gets a value from the `offerOrConsideration`. The type we get from the decoded logs is hard to work with,
 * being a mix of an array and a key:value object. This just abstracts away casting as any
 *
 * eg:
 [
  '0',
  '0x0000000000000000000000000000000000000000',
  '0',
  '46500000000000000',
  '0x459fE44490075a2eC231794F9548238E99bf25C0',
  itemType: '0',
  token: '0x0000000000000000000000000000000000000000',
  identifier: '0',
  amount: '46500000000000000',
  recipient: '0x459fE44490075a2eC231794F9548238E99bf25C0'
]
 * @param offerOrConsideration
 * @param key
 * @returns
 */
const getValueFromOfferOrConsideration = (offerOrConsideration: IndividualOffer | IndividualConsideration, key: 'token' | 'amount') => {
    return (offerOrConsideration as any)[key];
};

function calcPriceReducer(previous: number, current: IndividualConsideration | IndividualOffer) {
    const currency = currencies[getValueFromOfferOrConsideration(current, 'token').toLowerCase()];
    if (currency !== undefined) {
        const result =
            previous +
            Number(ethers.utils.formatUnits(getValueFromOfferOrConsideration(current, 'amount'), currency.decimals));

        return result;
    } else {
        return previous;
    }
}

/**
 * Seaport has a more complex log schema. Whereas other marketplaces (incl Wyvern)
 * have it easily visible in the log data, Seaport's log data is a tuple of each
 * component of the total price paid
 * ie: if 1 eth is paid, OS takes 2.5% and the collection takes 5%, there will be
 * 3 tuples in the offer/consideration representing:
 * - 0.925 to the seller
 * - 0.025 to OS
 * - 0.05 to the collection
 * @param decodedLogData
 * @param contractAddress
 * @returns
 */
export const getSeaportSalePrice = (decodedLogData: DecodedOSLogData, contractAddress: string) => {
    const offer = decodedLogData.offer;
    const consideration = decodedLogData.consideration;

    // if nfts are on the offer side, then consideration is the total price, otherwise the offer is the total price
    const offerSideNfts =
        offer.some(o =>
            getValueFromOfferOrConsideration(o, 'token').toLowerCase() === contractAddress.toLowerCase(),
        );

    if (offerSideNfts) {
        const totalConsiderationAmount = consideration.reduce(calcPriceReducer, 0);

        return parseFloat(totalConsiderationAmount.toFixed(5));
    } else {
        const totalOfferAmount = offer.reduce(calcPriceReducer, 0);

        return parseFloat(totalOfferAmount.toFixed(5));
    }
};
const OPENSEA_IPFS_GATEWAY = 'https://opensea.mypinata.cloud';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getTokenData = async (contract: ethers.Contract, tokenId: string) => {
    try {
        const tokenURI = await contract.tokenURI(tokenId);
        console.log(tokenURI);
        const { image, name, image_url } = (await axios.get<{ name: string; image: string; image_url: string; }>(tokenURI)).data;
        const safeImageUrl = image ?? image_url;
        let httpImageUrl = '';
        // If the token's image is an IPFS location, use OpenSea's public
        if (safeImageUrl.includes('ipfs://'))
            httpImageUrl = `${OPENSEA_IPFS_GATEWAY}/${safeImageUrl.replace('ipfs://', 'ipfs/')}`;
        else
            httpImageUrl = safeImageUrl;
        console.log({ assetName: name ?? tokenId, imageUrl: httpImageUrl });

        return { assetName: name ?? tokenId, imageUrl: httpImageUrl };
    } catch (error: any) {
        console.log('There was an error in resolving the tokenURI!');
        if (error.response) {
            console.log(error.response.data);
            console.log(error.response.status);
        } else {
            console.error(error.message);
        }
        return { assetName: tokenId, imageUrl: '' };
    }
};
