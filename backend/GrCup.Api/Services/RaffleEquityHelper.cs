namespace GrCup.Api.Services;

/// <summary>
/// Shared helpers for raffle draw logic. Extracted from InscripcionService.RaffleAsync
/// so the athlete raffle flow can reuse the same equity-split semantics with no behavior change.
/// </summary>
public static class RaffleEquityHelper
{
    /// <summary>
    /// Splits winners evenly by sex when possible. The first item of <paramref name="sexOf"/>
    /// is normalized to either "masculino" or "femenino".
    /// Returns (winners, fallbackReason) — fallbackReason is non-null when either sex pool
    /// is too small to satisfy its target, in which case winners is a fully-random draw from
    /// the whole pool.
    /// </summary>
    public static (List<T> Winners, string? FallbackReason) ApplySexEquitySplit<T>(
        IList<T> pool,
        int numWinners,
        Func<T, string> sexOf,
        Random rng)
    {
        var males = new List<T>();
        var females = new List<T>();
        foreach (var item in pool)
        {
            var s = NormalizeSex(sexOf(item));
            if (s == "masculino") males.Add(item);
            else if (s == "femenino") females.Add(item);
        }

        // target: ceil(N/2) for males, floor(N/2) for females (matches Inscripcion raffle behavior)
        int targetBig = (int)Math.Ceiling(numWinners / 2.0);
        int targetSmall = numWinners - targetBig;

        if (males.Count < targetBig || females.Count < targetSmall)
        {
            // Insufficient pool — fall back to fully random
            return (DrawN(pool, numWinners, rng), RaffleFilter.FallbackInsufficientPoolForEquity);
        }

        var drawnMales = DrawN(males, targetBig, rng);
        var drawnFemales = DrawN(females, targetSmall, rng);
        return (drawnMales.Concat(drawnFemales).ToList(), null);
    }

    /// <summary>
    /// Draws up to <paramref name="count"/> distinct random items from <paramref name="pool"/>.
    /// If pool is smaller than count, returns the full pool (shuffled).
    /// </summary>
    public static List<T> DrawN<T>(IList<T> pool, int count, Random rng)
    {
        if (pool.Count == 0) return new List<T>();
        if (count >= pool.Count)
        {
            // Return all items in randomized order
            return pool.OrderBy(_ => rng.Next()).ToList();
        }
        return pool.OrderBy(_ => rng.Next()).Take(count).ToList();
    }

    private static string NormalizeSex(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return string.Empty;
        var t = s.Trim();
        if (string.Equals(t, "Male", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(t, "M", StringComparison.OrdinalIgnoreCase))
            return "masculino";
        if (string.Equals(t, "Female", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(t, "F", StringComparison.OrdinalIgnoreCase))
            return "femenino";
        return t.ToLowerInvariant();
    }
}
