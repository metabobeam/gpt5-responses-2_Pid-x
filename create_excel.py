import pandas as pd

# Create sample data
data = {
    '年月': ['2024-01', '2024-02', '2024-03', '2024-01', '2024-02', '2024-03', '2024-01', '2024-02', '2024-03'],
    '売上': [1000000, 1200000, 1100000, 800000, 900000, 850000, 600000, 700000, 650000],
    '利益': [200000, 250000, 220000, 160000, 180000, 170000, 120000, 140000, 130000],
    '地域': ['東京', '東京', '東京', '大阪', '大阪', '大阪', '名古屋', '名古屋', '名古屋']
}

df = pd.DataFrame(data)

# Save as Excel file
df.to_excel('sample_sales_data.xlsx', index=False, engine='openpyxl')
print("Excel file created successfully!")
print(df)
