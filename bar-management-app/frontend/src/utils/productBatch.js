export const PRODUCT_NAMES = [
  'Jameson Normal Shot', 'Overmeer Semi-Sweet Glass', 'Lays Ground Nuts', 'Glenvent Reserve Shots',
  'Glenfidish 18 Years Shots', 'Glenvent 18 Years Shots', 'Doppel', 'Imperial', 'Jack Honey',
  'Kuchekuche', 'Heinken Normal Bottle', 'Green', 'Windhoek Lager', 'Bruto Bottle', 'Dragon',
  'Soda Water', 'Sapitwa', 'Drosty Hof Glass', 'Famouurs', 'Capestyle wine', '4th Street Glass',
  'Minerals Assorted', 'Jagermeister Shots', 'Black Lebel Cane', 'Absolute Vodka Shots',
  'Captain Morgan Shots', 'Pomme Breezer', 'Ancient Rum Shots', 'Amalura Shots', 'Tequila Silver Shots',
  'Bado Packet', 'Devine Power', 'Jameson Tripple Shots', 'Bruto Cane', 'Konyagi Small', 'Rider',
  'Bumbu', 'Hennessy Shots', 'Siminoff', 'Savana', 'Hunters dry', 'Miller', 'Tequila Gold Shots',
  'Water', 'Grapetizer Cane', 'Power', 'Windhoek Drought', 'Disposable', 'Breezer Blue',
  'Comaradas Brandy Shots', 'Cellar Cask Glass', 'Camaradas Gin Shots', 'Castle Lite Bottle',
  'Punchos', 'Lime Juice Glass', 'Black Label Bottle', 'Castel', 'Southern Confort Shots',
  'KVW 3 Years Shots', 'Chivas', 'Jack Daniels', 'Heineken Silver Cane', 'KVW 5 Years Shots',
  'Uganda Waragi', 'Select Reserve Shots', 'Castle Lite Cane', 'Malawi Gin Shots', 'Special',
  'Strawberry Lips Shots', 'Chill', 'Hunters Gold', 'Kumbusha', 'Squash Glass', 'Grants Shots',
  'Cactus Jack Shots', 'Heinken Normal Cane', 'Glenfidish 15 Years Shots', 'Budwiser',
  'Heineken Silver Bottle', 'Amstel', 'Konyagi Medium', 'KVW 10 Years', 'Premier Brandy Shots',
  'Tonic', 'Overmeer Dry Red', 'Glenvent 12 Years Shots', 'Red Bull', 'Ginger Ale', 'Corona'
];

const defaults = (name) => {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes('shot')) return { purchaseUnit: 'bottle', conversionQuantity: 28, sellingUnit: 'shot' };
  if (normalizedName.includes('glass')) return { purchaseUnit: 'carton', conversionQuantity: 20, sellingUnit: 'glass' };
  if (normalizedName.includes('cane')) return { purchaseUnit: 'bottle', conversionQuantity: 1, sellingUnit: 'can' };
  if (normalizedName.includes('packet')) return { purchaseUnit: 'bottle', conversionQuantity: 1, sellingUnit: 'packet' };
  return { purchaseUnit: 'bottle', conversionQuantity: 1, sellingUnit: 'bottle' };
};

export const createBatchRows = () => PRODUCT_NAMES.map((name, index) => ({
  id: `${index}-${name}`,
  name,
  selected: true,
  category: '',
  purchaseCost: '',
  sellingPrice: '',
  currentStock: '',
  lowStockThreshold: '5',
  ...defaults(name)
}));

export const calculateUnitCost = (row) => {
  const purchaseCost = Number(row.purchaseCost);
  const conversionQuantity = Number(row.conversionQuantity);
  if (!Number.isFinite(purchaseCost) || !Number.isFinite(conversionQuantity) || conversionQuantity <= 0) return null;
  return purchaseCost / conversionQuantity;
};
