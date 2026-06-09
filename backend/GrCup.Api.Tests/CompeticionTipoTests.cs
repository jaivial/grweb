using GrCup.Api.Services;

namespace GrCup.Api.Tests;

public class CompeticionTipoTests
{
    [Theory]
    [InlineData("fer", true)]
    [InlineData("FER", true)]
    [InlineData("Fer", true)]
    [InlineData("fEr", true)]
    [InlineData("FER ", false)]  // trailing space should not match
    [InlineData(" fer", false)]  // leading space should not match
    [InlineData("other", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsFerCompetition_HandlesAllCasings(string? tipo, bool expected)
    {
        var result = CompeticionHelper.IsFerCompetition(tipo);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void IsFerCompetition_UppercaseFER_ReturnsTrue()
    {
        // This is the specific bug case - competicionId=2 likely has "FER" stored
        Assert.True(CompeticionHelper.IsFerCompetition("FER"));
    }

    [Fact]
    public void IsFerCompetition_MixedCaseFer_ReturnsTrue()
    {
        Assert.True(CompeticionHelper.IsFerCompetition("Fer"));
    }
}
