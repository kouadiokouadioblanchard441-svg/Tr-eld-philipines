import hsbcOffice01 from "@assets/image_search/hsbc-banner-office-01.jpg";
import hsbcOffice02 from "@assets/image_search/hsbc-banner-office-02.jpg";
import hsbcOffice03 from "@assets/image_search/hsbc-banner-office-03.jpg";
import hsbcOffice04 from "@assets/image_search/hsbc-banner-office-04.jpg";

export const companyProductImages = [
  hsbcOffice01,
  hsbcOffice02,
  hsbcOffice03,
  hsbcOffice04,
];

export function getCompanyProductImage(index: number) {
  const normalizedIndex = Math.abs(index) % companyProductImages.length;
  return companyProductImages[normalizedIndex];
}