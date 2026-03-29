namespace GrCup.Api.Models.Enums;

public static class WeightCategory
{
    // Women's categories
    public const string Women43 = "-43";
    public const string Women47 = "-47";
    public const string Women52 = "-52";
    public const string Women57 = "-57";
    public const string Women63 = "-63";
    public const string Women69 = "-69";
    public const string Women76 = "-76";
    public const string Women84 = "-84";
    public const string WomenPlus84 = "+84";

    // Men's categories
    public const string Men53 = "-53";
    public const string Men59 = "-59";
    public const string Men66 = "-66";
    public const string Men74 = "-74";
    public const string Men83 = "-83";
    public const string Men93 = "-93";
    public const string Men105 = "-105";
    public const string Men120 = "-120";
    public const string MenPlus120 = "+120";

    public static readonly string[] WomenCategories =
    [
        Women43, Women47, Women52, Women57, Women63, Women69, Women76, Women84, WomenPlus84
    ];

    public static readonly string[] MenCategories =
    [
        Men53, Men59, Men66, Men74, Men83, Men93, Men105, Men120, MenPlus120
    ];

    public static readonly string[] AllCategories =
    [
        .. WomenCategories,
        .. MenCategories
    ];

    public static bool IsValid(string category) => AllCategories.Contains(category);

    public static Sex? GetSexForCategory(string category)
    {
        if (WomenCategories.Contains(category)) return Sex.Female;
        if (MenCategories.Contains(category)) return Sex.Male;
        return null;
    }
}
