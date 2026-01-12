cat > js/calculators/materialMatcher.js << 'EOF'
// Material Matcher - Supabase product matching
const SUPABASE_URL = '[https://audvkmgaufxzylebtmpx.supabase.co](https://audvkmgaufxzylebtmpx.supabase.co)';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

let supabaseClient;

function initSupabase() {
  if (typeof window !== 'undefined' && window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  }
  return false;
}

async function findMatchingProducts(materialItem) {
  if (!supabaseClient) {
    if (!initSupabase()) {
      console.error('Supabase not initialized');
      return null;
    }
  }

  const { item, category } = materialItem;

  try {
    let { data, error } = await supabaseClient
      .from('retail_products')
      .select('*')
      .eq('material_category', category)
      .ilike('product_name', `%${item}%`)
      .eq('is_relevant', true)
      .order('relevance_score', { ascending: false })
      .limit(5);

    if (!data || data.length === 0) {
      ({ data, error } = await supabaseClient
        .from('retail_products')
        .select('*')
        .ilike('product_name', `%${item}%`)
        .eq('is_relevant', true)
        .order('relevance_score', { ascending: false })
        .limit(5));
    }

    if (error || !data || data.length === 0) {
      return null;
    }

    const sortedByPrice = data.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    
    return {
      exactMatch: sortedByPrice[0],
      alternatives: sortedByPrice.slice(1, 5)
    };

  } catch (err) {
    console.error('Error searching products:', err);
    return null;
  }
}

async function enhanceMaterialListWithProducts(materialList) {
  const enhancedList = [];

  for (const material of materialList) {
    const match = await findMatchingProducts(material);
    
    if (match && match.exactMatch) {
      enhancedList.push({
        ...material,
        sku: match.exactMatch.sku,
        productName: match.exactMatch.product_name,
        brand: match.exactMatch.brand,
        retailPrice: parseFloat(match.exactMatch.price),
        storeMatch: true,
        matchConfidence: match.exactMatch.relevance_score || 0.8,
        alternatives: match.alternatives
      });
    } else {
      enhancedList.push({
        ...material,
        sku: 'ESTIMATE',
        productName: material.item,
        brand: 'RS Means Pricing',
        retailPrice: material.unitCost,
        storeMatch: false,
        matchConfidence: 0,
        alternatives: []
      });
    }
  }

  return enhancedList;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSupabase, findMatchingProducts, enhanceMaterialListWithProducts };
}