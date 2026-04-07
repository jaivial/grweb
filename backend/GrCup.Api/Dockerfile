# Build stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY ["GrCup.Api.csproj", "./"]
RUN dotnet restore "GrCup.Api.csproj"

# Copy everything else and build
COPY . .
RUN dotnet publish "GrCup.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

# Create non-root user for security
RUN adduser --disabled-password --gecos '' appuser

# Copy published app
COPY --from=build /app/publish .

# Set environment defaults
ENV ASPNETCORE_URLS=http://+:5006
ENV ASPNETCORE_ENVIRONMENT=Production

# Expose port
EXPOSE 5006

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5006/api/health || exit 1

ENTRYPOINT ["dotnet", "GrCup.Api.dll"]
